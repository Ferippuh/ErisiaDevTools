from __future__ import annotations

import json
import os
from typing import Dict

from flask import Flask, jsonify, render_template, request

app = Flask(__name__, static_folder="static", template_folder="templates")


def build_sound_map(directory: str) -> Dict[str, Dict[str, list[str]]]:
    sounds: Dict[str, Dict[str, list[str]]] = {}

    for entry in os.listdir(directory):
        if entry in {".", ".."}:
            continue

        full_path = os.path.join(directory, entry)
        if os.path.isdir(full_path):
            continue

        key = entry
        if entry.lower().endswith(".ogg"):
            key = entry[:-4]
        else:
            key = os.path.splitext(entry)[0]

        sounds[key] = {"sounds": [f"custom/{key}"]}

    return dict(sorted(sounds.items()))


@app.route("/")
def index() -> str:
    return render_template("index.html")


@app.route("/generate", methods=["POST"])
def generate():
    payload = request.get_json(silent=True) or {}
    directory = (payload.get("directory") or "").strip()

    if not directory:
        return jsonify({"error": "Informe um caminho de diretório."}), 400

    if not os.path.isdir(directory):
        return jsonify({"error": "Diretório inválido ou inacessível."}), 400

    try:
        sound_map = build_sound_map(directory)
    except OSError as exc:
        return jsonify({"error": f"Falha ao ler o diretório: {exc}"}), 500

    if not sound_map:
        return jsonify({"error": "Nenhum arquivo válido foi encontrado no diretório."}), 404

    json_text = json.dumps(sound_map, indent=2, ensure_ascii=False)

    return jsonify({
        "jsonText": json_text,
        "count": len(sound_map),
    })


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000, debug=True)
