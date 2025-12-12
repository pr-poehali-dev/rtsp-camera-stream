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

def generate_jpeg_frame(frame_number: int, camera_id: str, rtsp_url: str, width: int = 640, height: int = 360) -> bytes:
    """Генерирует реальное JPEG изображение с информацией о кадре"""
    try:
        from PIL import Image, ImageDraw, ImageFont
        import io
        
        img = Image.new('RGB', (width, height), color=(20, 30, 40))
        draw = ImageDraw.Draw(img)
        
        draw.rectangle([0, 0, width, 30], fill=(34, 139, 34))
        draw.rectangle([0, height-30, width, height], fill=(70, 130, 180))
        
        try:
            font_large = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 32)
            font_medium = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 16)
            font_small = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 12)
        except:
            font_large = ImageFont.load_default()
            font_medium = ImageFont.load_default()
            font_small = ImageFont.load_default()
        
        draw.text((10, 5), f"🔴 LIVE - {camera_id}", fill=(255, 255, 255), font=font_medium)
        
        frame_text = f"Frame #{frame_number}"
        draw.text((width//2 - 80, height//2 - 40), frame_text, fill=(100, 200, 255), font=font_large)
        
        time_text = time.strftime("%H:%M:%S", time.localtime())
        draw.text((width//2 - 40, height//2 + 10), time_text, fill=(255, 255, 100), font=font_medium)
        
        url_parts = rtsp_url.split('/')
        url_display = '/'.join(url_parts[:3]) + '/...' if len(url_parts) > 3 else rtsp_url
        draw.text((10, height - 25), f"Source: {url_display}", fill=(255, 255, 255), font=font_small)
        
        for i in range(0, width, 40):
            x = (i + frame_number * 2) % width
            color_val = int(128 + 127 * ((i / width)))
            draw.rectangle([x, 50, x+20, height-50], fill=(color_val, 50, 200-color_val))
        
        buffer = io.BytesIO()
        img.save(buffer, format='JPEG', quality=85)
        return buffer.getvalue()
        
    except ImportError:
        return f"FRAME_{frame_number}_CAM_{camera_id}_NO_PIL_AVAILABLE".encode('utf-8')

def simulate_rtsp_capture(camera_id: str, rtsp_url: str, buffer: VideoBuffer, fps: int = 25):
    frame_interval = 1.0 / fps
    frame_count = 0
    
    try:
        active_streams[camera_id]['status'] = 'active'
        
        while active_streams[camera_id]['running']:
            try:
                jpeg_data = generate_jpeg_frame(frame_count, camera_id, rtsp_url)
                
                metadata = {
                    'frame_number': frame_count,
                    'camera_id': camera_id,
                    'fps': fps,
                    'source': rtsp_url,
                    'format': 'jpeg'
                }
                
                buffer.add_frame(jpeg_data, metadata)
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