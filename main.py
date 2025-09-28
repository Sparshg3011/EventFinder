from flask import Flask, request, jsonify
from flask_cors import CORS
import requests
import os
from dotenv import load_dotenv
from geolib import geohash as geohash_lib

load_dotenv()

app = Flask(__name__)
CORS(app)

TM_API_KEY = os.environ.get('TM_API_KEY', '')
IPINFO_TOKEN = os.environ.get('IPINFO_TOKEN', '')
GOOGLE_GEOCODING_API_KEY = os.environ.get('GOOGLE_GEOCODING_API_KEY', '')
TICKETMASTER_BASE_URL = 'https://app.ticketmaster.com/discovery/v2'

CATEGORY_SEGMENT_MAP = {
    'music': 'KZFzniwnSyZfZ7v7nJ',
    'sports': 'KZFzniwnSyZfZ7v7nE',
    'arts': 'KZFzniwnSyZfZ7v7na',
    'film': 'KZFzniwnSyZfZ7v7nn',
    'miscellaneous': 'KZFzniwnSyZfZ7v7n1'
}

@app.route('/')
def index():
    return jsonify({'message': 'Backend API is running', 'endpoints': ['/api/search', '/api/event', '/api/venue', '/api/health']})

@app.route('/api/config')
def get_config():
    config_js = f"""
window.CONFIG = {{
    IPINFO_TOKEN: '{IPINFO_TOKEN}',
    GOOGLE_GEOCODING_API_KEY: '{GOOGLE_GEOCODING_API_KEY}'
}};
"""
    return config_js, 200, {'Content-Type': 'application/javascript'}

@app.route('/api/search')
def search_events():
    try:
        keyword = request.args.get('keyword', '').strip()
        distance = request.args.get('distance', '10').strip() or '10'
        category = request.args.get('category', '').strip()
        lat = request.args.get('lat', '').strip()
        lon = request.args.get('lon', '').strip()
        geo_point = request.args.get('geoPoint', '').strip()

        if not keyword:
            return jsonify({'error': 'Missing required parameters'}), 400

        if not geo_point:
            if not lat or not lon:
                return jsonify({'error': 'Missing required parameters'}), 400
            try:
                geo_point = geohash_lib.encode(float(lat), float(lon), 7)
            except Exception:
                return jsonify({'error': 'Invalid coordinates'}), 400

        params = {
            'apikey': TM_API_KEY,
            'keyword': keyword,
            'geoPoint': geo_point,
            'radius': distance,
            'unit': 'miles',
            'size': 20
        }

        if category and category in CATEGORY_SEGMENT_MAP:
            params['segmentId'] = CATEGORY_SEGMENT_MAP[category]

        r = requests.get(f'{TICKETMASTER_BASE_URL}/events.json', params=params, timeout=15)
        if r.ok:
            return jsonify(r.json())
        return jsonify({'error': 'Failed to fetch events'}), r.status_code
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/event')
def get_event_details():
    try:
        event_id = request.args.get('id', '').strip()
        if not event_id:
            return jsonify({'error': 'Missing event ID'}), 400

        params = {'apikey': TM_API_KEY}
        r = requests.get(f'{TICKETMASTER_BASE_URL}/events/{event_id}.json', params=params, timeout=15)
        if r.ok:
            return jsonify(r.json())
        return jsonify({'error': 'Failed to fetch event details'}), r.status_code
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/venue')
def search_venues():
    try:
        keyword = request.args.get('keyword', '').strip()
        if not keyword:
            return jsonify({'error': 'Missing venue keyword'}), 400

        params = {'apikey': TM_API_KEY, 'keyword': keyword}
        r = requests.get(f'{TICKETMASTER_BASE_URL}/venues.json', params=params, timeout=15)
        if r.ok:
            return jsonify(r.json())
        return jsonify({'error': 'Failed to fetch venue details'}), r.status_code
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/health')
def health():
    return jsonify({'status': 'ok'})

if __name__ == '__main__':
    app.run(host='127.0.0.1', port=3001, debug=False, use_reloader=False)
