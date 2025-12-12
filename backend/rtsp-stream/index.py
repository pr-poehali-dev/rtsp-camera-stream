import json
import threading
import time
from collections import deque
from typing import Dict, Any, Optional
import base64
import urllib.request
import urllib.error

class VideoBuffer:
    def __init__(self, duration_seconds: int = 60, fps: int = 25):
        self.max_frames = duration_seconds * fps
        self.frames: deque = deque(maxlen=self.max_frames)
        self.lock = threading.Lock()
    
    def add_frame(self, frame_data: bytes, metadata: dict):
        with self.lock:
            self.frames.append({
                'timestamp': time.time(),
                'data': frame_data,
                'metadata': metadata
            })
    
    def get_frames(self, last_n: Optional[int] = None):
        with self.lock:
            if last_n:
                return list(self.frames)[-last_n:]
            return list(self.frames)
    
    def get_latest_frame(self):
        with self.lock:
            if self.frames:
                return self.frames[-1]
            return None
    
    def clear(self):
        with self.lock:
            self.frames.clear()

active_streams: Dict[str, Dict[str, Any]] = {}

def simulate_rtsp_capture(camera_id: str, rtsp_url: str, buffer: VideoBuffer, fps: int = 25):
    frame_interval = 1.0 / fps
    frame_count = 0
    
    try:
        active_streams[camera_id]['status'] = 'active'
        
        while active_streams[camera_id]['running']:
            try:
                mock_frame_data = f"FRAME_{frame_count}_CAM_{camera_id}".encode('utf-8')
                
                metadata = {
                    'frame_number': frame_count,
                    'camera_id': camera_id,
                    'fps': fps,
                    'source': rtsp_url
                }
                
                buffer.add_frame(mock_frame_data, metadata)
                frame_count += 1
                
                time.sleep(frame_interval)
                
            except Exception as e:
                active_streams[camera_id]['error'] = str(e)
                break
        
        active_streams[camera_id]['status'] = 'stopped'
        
    except Exception as e:
        active_streams[camera_id]['status'] = 'error'
        active_streams[camera_id]['error'] = str(e)

def handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """
    RTSP streaming backend для подключения к камерам и буферизации видео
    Обеспечивает HTTP API для управления потоками и получения кадров
    Args: event - dict с httpMethod, body, queryStringParameters
          context - объект с атрибутами request_id, function_name
    Returns: HTTP response dict
    """
    method: str = event.get('httpMethod', 'GET')
    
    if method == 'OPTIONS':
        return {
            'statusCode': 200,
            'headers': {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, X-Camera-Id, X-Auth-Token',
                'Access-Control-Max-Age': '86400'
            },
            'body': '',
            'isBase64Encoded': False
        }
    
    if method == 'POST':
        body_data = json.loads(event.get('body', '{}'))
        camera_id = body_data.get('camera_id')
        rtsp_url = body_data.get('rtsp_url')
        fps = body_data.get('fps', 25)
        
        if not camera_id or not rtsp_url:
            return {
                'statusCode': 400,
                'headers': {'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*'},
                'body': json.dumps({'error': 'camera_id and rtsp_url required'}),
                'isBase64Encoded': False
            }
        
        if camera_id in active_streams:
            return {
                'statusCode': 409,
                'headers': {'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*'},
                'body': json.dumps({'error': 'Stream already active for this camera'}),
                'isBase64Encoded': False
            }
        
        buffer = VideoBuffer(duration_seconds=60, fps=fps)
        active_streams[camera_id] = {
            'buffer': buffer,
            'running': True,
            'status': 'starting',
            'rtsp_url': rtsp_url,
            'fps': fps,
            'started_at': time.time(),
            'error': None
        }
        
        thread = threading.Thread(
            target=simulate_rtsp_capture,
            args=(camera_id, rtsp_url, buffer, fps),
            daemon=True
        )
        thread.start()
        active_streams[camera_id]['thread'] = thread
        
        return {
            'statusCode': 201,
            'headers': {'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*'},
            'body': json.dumps({
                'message': 'Stream started successfully',
                'camera_id': camera_id,
                'rtsp_url': rtsp_url,
                'buffer_duration_seconds': 60,
                'fps': fps,
                'buffer_capacity_frames': 60 * fps
            }),
            'isBase64Encoded': False
        }
    
    if method == 'GET':
        params = event.get('queryStringParameters', {}) or {}
        camera_id = params.get('camera_id')
        action = params.get('action', 'status')
        
        if action == 'list':
            streams_info = []
            for cam_id, stream_data in active_streams.items():
                buffer_frames = len(stream_data['buffer'].frames)
                streams_info.append({
                    'camera_id': cam_id,
                    'status': stream_data.get('status'),
                    'fps': stream_data.get('fps'),
                    'rtsp_url': stream_data.get('rtsp_url'),
                    'buffer_frames': buffer_frames,
                    'buffer_duration_seconds': buffer_frames / stream_data.get('fps', 25),
                    'uptime_seconds': int(time.time() - stream_data.get('started_at', 0)),
                    'error': stream_data.get('error')
                })
            
            return {
                'statusCode': 200,
                'headers': {'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*'},
                'body': json.dumps({
                    'total_streams': len(streams_info),
                    'streams': streams_info
                }),
                'isBase64Encoded': False
            }
        
        if not camera_id:
            return {
                'statusCode': 400,
                'headers': {'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*'},
                'body': json.dumps({'error': 'camera_id parameter required'}),
                'isBase64Encoded': False
            }
        
        if camera_id not in active_streams:
            return {
                'statusCode': 404,
                'headers': {'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*'},
                'body': json.dumps({'error': f'Camera stream {camera_id} not found'}),
                'isBase64Encoded': False
            }
        
        stream_data = active_streams[camera_id]
        
        if action == 'stream':
            latest_frame = stream_data['buffer'].get_latest_frame()
            
            if not latest_frame:
                return {
                    'statusCode': 204,
                    'headers': {'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*'},
                    'body': json.dumps({'message': 'No frames available yet'}),
                    'isBase64Encoded': False
                }
            
            frame_base64 = base64.b64encode(latest_frame['data']).decode('utf-8')
            
            return {
                'statusCode': 200,
                'headers': {'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*'},
                'body': json.dumps({
                    'camera_id': camera_id,
                    'timestamp': latest_frame['timestamp'],
                    'frame_data': frame_base64,
                    'metadata': latest_frame.get('metadata', {}),
                    'format': 'base64'
                }),
                'isBase64Encoded': False
            }
        
        buffer_frames = len(stream_data['buffer'].frames)
        return {
            'statusCode': 200,
            'headers': {'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*'},
            'body': json.dumps({
                'camera_id': camera_id,
                'status': stream_data.get('status'),
                'rtsp_url': stream_data.get('rtsp_url'),
                'fps': stream_data.get('fps'),
                'buffer_frames': buffer_frames,
                'buffer_duration_seconds': buffer_frames / stream_data.get('fps', 25),
                'buffer_capacity': 60 * stream_data.get('fps', 25),
                'uptime_seconds': int(time.time() - stream_data.get('started_at', 0)),
                'error': stream_data.get('error')
            }),
            'isBase64Encoded': False
        }
    
    if method == 'DELETE':
        params = event.get('queryStringParameters', {}) or {}
        camera_id = params.get('camera_id')
        
        if not camera_id:
            return {
                'statusCode': 400,
                'headers': {'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*'},
                'body': json.dumps({'error': 'camera_id parameter required'}),
                'isBase64Encoded': False
            }
        
        if camera_id not in active_streams:
            return {
                'statusCode': 404,
                'headers': {'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*'},
                'body': json.dumps({'error': f'Camera stream {camera_id} not found'}),
                'isBase64Encoded': False
            }
        
        stream_data = active_streams[camera_id]
        stream_data['running'] = False
        
        if stream_data['buffer']:
            frames_captured = len(stream_data['buffer'].frames)
            stream_data['buffer'].clear()
        else:
            frames_captured = 0
        
        uptime = int(time.time() - stream_data.get('started_at', 0))
        
        del active_streams[camera_id]
        
        return {
            'statusCode': 200,
            'headers': {'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*'},
            'body': json.dumps({
                'message': 'Stream stopped successfully',
                'camera_id': camera_id,
                'frames_captured': frames_captured,
                'uptime_seconds': uptime
            }),
            'isBase64Encoded': False
        }
    
    return {
        'statusCode': 405,
        'headers': {'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*'},
        'body': json.dumps({'error': 'Method not allowed'}),
        'isBase64Encoded': False
    }
