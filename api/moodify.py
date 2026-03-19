from flask import Flask, request, jsonify

app = Flask(__name__)

# Mock dataset
songs = [
    {"id": 1, "title": "Happy Song", "mood": "happy", "genre": "pop", "energy": "high", "tempo": "fast"},
    {"id": 2, "title": "Sad Tune", "mood": "sad", "genre": "blues", "energy": "low", "tempo": "slow"},
    # Add more songs as needed
]

@app.route('/moods', methods=['GET'])
def get_moods():
    moods = list(set(song['mood'] for song in songs))
    return jsonify(moods=moods)

@app.route('/playlist', methods=['POST'])
def create_playlist():
    data = request.json
    mood = data.get('mood')
    genre = data.get('genre')
    energy = data.get('energy')
    
    playlist = [
        song for song in songs 
        if song['mood'] == mood and (not genre or song['genre'] == genre) and (not energy or song['energy'] == energy)
    ]
    return jsonify(playlist=playlist)

@app.route('/playlist/<int:playlist_id>', methods=['GET'])
def get_playlist(playlist_id):
    # For demonstration, just return the first song
    song = next((song for song in songs if song['id'] == playlist_id), None)
    return jsonify(song=song)

if __name__ == '__main__':
    app.run(debug=True)