from flask import Flask, send_from_directory
from flask_cors import CORS

app = Flask(__name__, static_folder='static', static_url_path='')
CORS(app)

@app.route('/')
def index():
    return send_from_directory('static', 'index.html')

@app.route('/<path:filename>')
def static_files(filename):
    return send_from_directory('static', filename)

if __name__ == '__main__':
    app.run(host='127.0.0.1', port=3000, debug=False, use_reloader=False)
