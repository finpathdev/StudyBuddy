from flask import Flask, render_template, request, jsonify
import requests

app = Flask(__name__)

LM_STUDIO_URL = "http://localhost:1234/v1/chat/completions"

def ask_lm_studio(prompt):
    payload = {
        "model": "gemma-2-4b",
        "messages": [{"role": "user", "content": prompt}],
        "temperature": 0.7
    }
    response = requests.post(LM_STUDIO_URL, json=payload)
    return response.json()["choices"][0]["message"]["content"]

@app.route("/")
def index():
    return render_template("index.html")

@app.route("/summarize", methods=["GET", "POST"])
def summarize():
    if request.method == "POST":
        text = request.form["text"]
        summary = ask_lm_studio(f"Summarize this text:\n\n{text}")
        return render_template("summarize.html", summary=summary)
    return render_template("summarize.html")

@app.route("/flashcards", methods=["GET", "POST"])
def flashcards():
    if request.method == "POST":
        text = request.form["text"]
        cards = ask_lm_studio(f"Create flashcards from this:\n\n{text}")
        return render_template("flashcards.html", cards=cards)
    return render_template("flashcards.html")

@app.route("/questions", methods=["GET", "POST"])
def questions():
    if request.method == "POST":
        text = request.form["text"]
        qs = ask_lm_studio(f"Generate 10 study questions from this:\n\n{text}")
        return render_template("questions.html", questions=qs)
    return render_template("questions.html")

@app.route("/lecture", methods=["GET", "POST"])
def lecture():
    if request.method == "POST":
        topic = request.form["topic"]
        lecture = ask_lm_studio(f"Explain this topic like a teacher:\n\n{topic}")
        return render_template("lecture.html", lecture=lecture)
    return render_template("lecture.html")

@app.route("/chat", methods=["GET", "POST"])
def chat():
    if request.method == "POST":
        message = request.form["message"]
        reply = ask_lm_studio(message)
        return jsonify({"reply": reply})
    return render_template("chat.html")

@app.route("/analytics")
def analytics():
    return render_template("analytics.html")

if __name__ == "__main__":
    app.run(debug=True)
