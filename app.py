import uvicorn
from fastapi import FastAPI, File, UploadFile
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from typing import Optional
import io

# FunASR (SenseVoice)
from funasr import AutoModel
from funasr.utils import postprocess_utils

app = FastAPI()
app.mount("/static", StaticFiles(directory="static"), name="static")

@app.get("/")
def read_root():
    return FileResponse("static/index.html")

# 1) SenseVoiceSmall のモデルをロード
#   - モデルは "damo/SenseVoiceSmall" 等、ModelScopeやHFの公開名に合わせて指定。
#   - vad_model="fsmn-vad" を付けると長い音声を分割しつつ推論可能。
#   - SERタスクはSenseVoiceが内部的に行う形なので、ban_emo_unk等の引数が使える可能性あり。
model = AutoModel(
    # model="FunAudioLLM/SenseVoiceSmall",
    # model="damo/emotion2vec-large",
    model="iic/emotion2vec_plus_large",
    # vad_model="fsmn-vad",
    # vad_kwargs={"max_single_segment_time": 30000},
    device="cpu",  # MPSを使いたい場合は "mps" などに切り替え (PyTorchのバージョンに依存)
    hub="hf"
)

@app.post("/predict_emotion")
async def predict_emotion(file: UploadFile = File(...)):
    """
    フロント側から送られた音声ファイルを SenseVoice で感情推定。
    返却： {'emo_label': 'happy', 'emo_score': 0.85, ...} のようなイメージ
    """
    audio_data = await file.read()
    
    # 一時ファイル保存などを挟まなくても、AutoModel.generateに直接バイナリを渡せる場合があります。
    # ドキュメントによれば:
    #   res = model.generate(input="音声ファイルパスかバイナリ", language="auto", use_itn=True, ...)
    #   という使い方が多いですが、SER結果は emo_label / emo_score などで取得できる可能性あり。
    # 以下は例示的なコードです。実際には model.generate(...) の戻り値を確認してください。
    
    # ここでは一時WAVに書き出してから推論する形をとります。
    import tempfile
    import wave
    
    # WebM等で来た場合もあるので、pydubで変換してWAVにすることを推奨
    from pydub import AudioSegment
    temp_wav = tempfile.NamedTemporaryFile(suffix=".wav", delete=False)
    try:
        audio_segment = AudioSegment.from_file(io.BytesIO(audio_data))
        audio_segment.export(temp_wav.name, format="wav")
        temp_wav.flush()
        # SenseVoiceで推論
        # SERカテゴリを返すため、必要に応じてパラメータを追加（ban_emo_unk=False等）
        # resはリスト形式になっている可能性があるので先頭要素を取り出す
        result = model.generate(
            input=temp_wav.name,
            # language="auto",
            # # batch_size_s=60,
            # merge_vad=False,
            # # merge_length_s=15,
            # ban_emo_unk=True,
            output_dir="./outputs",
            granularity="utterance",
            extract_embedding=False
        )
        print(result)
        if isinstance(result, list) and len(result) > 0:
            # 最初のセグメントを参照
            first_seg = result[0]
            emo_label = first_seg.get("labels", "unknown")
            emo_score = first_seg.get("scores", 0.0)
        else:
            emo_label = "unknown"
            emo_score = 0.0
        return {
            "emo_label": emo_label,
            "emo_score": emo_score
        }
    finally:
        temp_wav.close()


if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8000)
