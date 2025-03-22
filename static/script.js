let mediaRecorder;
let audioChunks = [];
let isRecording = false;

// 要素取得
const recordBtn = document.getElementById('recordBtn');
const stopBtn = document.getElementById('stopBtn');
const fileInput = document.getElementById('fileInput');
const uploadBtn = document.getElementById('uploadBtn');
const resultDisplay = document.getElementById('resultDisplay');

// メイン感情カード
const mainEmotionCard = document.getElementById('mainEmotionCard');
const emotionIcon = document.getElementById('emotionIcon');
const emotionNameEl = document.getElementById('emotionName');
const emotionScoreEl = document.getElementById('emotionScore');

// ローディング用
const loadingOverlay = document.getElementById('loadingOverlay');

// 感情マップ
const emotionMap = {
  "生气/angry":        { icon: "😡", label: "怒り" },
  "厌恶/disgusted":    { icon: "🤢", label: "嫌悪" },
  "恐惧/fearful":      { icon: "😱", label: "恐怖" },
  "开心/happy":        { icon: "😊", label: "ハッピー" },
  "中立/neutral":      { icon: "😐", label: "中立" },
  "其他/other":        { icon: "❓", label: "その他" },
  "难过/sad":          { icon: "😢", label: "悲しい" },
  "吃惊/surprised":    { icon: "😲", label: "びっくり" },
  "<unk>":             { icon: "❔", label: "不明" }
};

// Chart.js ドーナツグラフ
const ctx = document.getElementById('emotionChart').getContext('2d');
const emotionColors = [
  "#ff6384", // angry
  "#36a2eb", // disgusted
  "#cc65fe", // fearful
  "#ffce56", // happy
  "#ffa600", // neutral
  "#43AA8B", // other
  "#577590", // sad
  "#9775fa", // surprised
  "#8E8E8E"  // <unk>
];

const emotionChart = new Chart(ctx, {
  type: 'doughnut',
  data: {
    labels: [],
    datasets: [{
      label: "感情スコア",
      data: [],
      backgroundColor: emotionColors,
      hoverOffset: 12
    }]
  },
  options: {
    animation: {
      animateRotate: true,
      animateScale: true,
      duration: 1500,
      easing: 'easeOutBounce'
    },
    plugins: {
      tooltip: {
        callbacks: {
          label: function(context) {
            const lbl = context.label;
            const val = context.parsed;
            return `${lbl}: ${val.toFixed(4)}`;
          }
        }
      }
    }
  }
});

// ==== ローディング表示制御関数 ====
function showLoading() {
  loadingOverlay.style.display = 'flex'; // overlayを表示
}
function hideLoading() {
  loadingOverlay.style.display = 'none'; // overlayを非表示
}

// 録音開始
recordBtn.addEventListener('click', async () => {
  if (isRecording) return;
  isRecording = true;
  audioChunks = [];

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorder = new MediaRecorder(stream);
    mediaRecorder.start();
    console.log("録音開始");

    mediaRecorder.addEventListener('dataavailable', e => {
      audioChunks.push(e.data);
    });

    recordBtn.disabled = true;
    stopBtn.disabled = false;
  } catch (err) {
    console.error("マイクアクセス失敗:", err);
    alert("マイクを使用できません。権限を確認してください。");
  }
});

// 録音停止
stopBtn.addEventListener('click', () => {
  if (!isRecording) return;
  isRecording = false;

  mediaRecorder.stop();
  mediaRecorder.onstop = async () => {
    console.log("録音停止");
    stopBtn.disabled = true;
    recordBtn.disabled = false;

    // ローディング開始
    showLoading();

    const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
    const formData = new FormData();
    formData.append("file", audioBlob, "recorded_audio.webm");

    try {
      const res = await fetch("/predict_emotion", {
        method: "POST",
        body: formData
      });
      if (!res.ok) throw new Error(`サーバーエラー: ${res.status}`);

      const data = await res.json();  // { emo_label: [...], emo_score: [...] }
      console.log("サーバー応答(録音):", data);

      updateVisualization(data);

    } catch (err) {
      console.error("推定エラー(録音):", err);
      resultDisplay.textContent = "エラーが発生しました(録音)。";
    } finally {
      // 処理完了後にローディング非表示
      hideLoading();
    }
  };
});

// ファイルアップロード
uploadBtn.addEventListener('click', async () => {
  const file = fileInput.files[0];
  if (!file) {
    alert("音声ファイルを選択してください。");
    return;
  }

  // ローディング開始
  showLoading();

  try {
    const formData = new FormData();
    formData.append("file", file);

    const res = await fetch("/predict_emotion", {
      method: "POST",
      body: formData
    });
    if (!res.ok) throw new Error(`サーバーエラー: ${res.status}`);

    const data = await res.json();
    console.log("サーバー応答(ファイル):", data);

    updateVisualization(data);

  } catch (err) {
    console.error("アップロード推定エラー:", err);
    resultDisplay.textContent = "エラーが発生しました(ファイル)。";
  } finally {
    // 処理完了後にローディング非表示
    hideLoading();
  }
});

// === 全UIを更新する関数 ===
function updateVisualization(result) {
  const { emo_label, emo_score } = result;

  // 1) 全感情テキスト
  // 修正後サンプル
  const textList = emo_label.map((lbl, i) => {
    // emotionMapから日本語ラベル取得
    const mapped = emotionMap[lbl];
    // slash以降の英語を切り出す（例: "生气/angry" → "angry"）
    const engPart = lbl.split("/")[1] || "???";
    
    // スコア
    const scoreStr = emo_score[i].toFixed(4);

    if (mapped) {
      // 例: mapped.label = "怒り", engPart = "angry" → "怒り(angry): 0.1234"
      return `${mapped.label}(${engPart}): ${scoreStr}`;
    } else {
      // mapに無い場合はそのまま
      return `${lbl}: ${scoreStr}`;
    }
  });
  resultDisplay.textContent = `全感情: ${textList.join(", ")}`;

  // 2) メイン感情を特定
  let maxIdx = 0;
  let maxVal = 0;
  for (let i = 0; i < emo_score.length; i++) {
    if (emo_score[i] > maxVal) {
      maxVal = emo_score[i];
      maxIdx = i;
    }
  }
  const mainEmotionKey = emo_label[maxIdx];
  const mainScore = maxVal;

  // マップからアイコン＆日本語ラベルを取得
  const mapped = emotionMap[mainEmotionKey] || { icon: "❔", label: mainEmotionKey };
  emotionIcon.textContent = mapped.icon;
  emotionNameEl.textContent = mapped.label;
  emotionScoreEl.textContent = `スコア: ${mainScore.toFixed(4)}`;

  // 3) ドーナツグラフを更新
  const chartLabels = createLabelsForChart(emo_label);
  emotionChart.data.labels = chartLabels;
  emotionChart.data.datasets[0].data = emo_score;
  emotionChart.update();

  // 4) メイン感情ごとにカード背景を変更
  let cardColor = "#fef4ea";
  if (mainEmotionKey.includes("angry")) cardColor = "#ffe5e5";
  if (mainEmotionKey.includes("happy")) cardColor = "#fff9e6";
  if (mainEmotionKey.includes("sad"))   cardColor = "#eef2ff";
  mainEmotionCard.style.background = cardColor;

  // 5) 紙吹雪 (happy が 0.5 以上で)
  if (mainEmotionKey.includes("happy") && mainScore > 0.5) {
    runConfetti();
  }
}

// ==== 紙吹雪アニメーション ====
function runConfetti() {
  const duration = 2000; // 2秒
  const end = Date.now() + duration;

  /* 画面中央上から降ってくるように調整
     angle=90前後, origin.y=0(上) or -0.1, spread広め */
  (function frame() {
    confetti({
      particleCount: 4,
      angle: 90,        // 真下向き
      spread: 60,       // 横方向への広がり
      startVelocity: 20,
      origin: {
        x: Math.random(), // 横位置はランダム
        y: -0.1           // 画面の少し上
      },
      colors: ['#ffd700', '#ff6b81', '#48e5c2', '#f9f871']
    });
    if (Date.now() < end) {
      requestAnimationFrame(frame);
    }
  })();
}
// 例: createLabelsForChart() という関数を作る
function createLabelsForChart(emo_label) {
  // emo_label: ["生气/angry", "厌恶/disgusted", ...]
  return emo_label.map(lbl => {
    const mapped = emotionMap[lbl];
    if (!mapped) {
      // マップに無い場合はそのまま
      return lbl; 
    } else {
      // "生气/angry" → "angry"
      const engPart = lbl.includes("/") ? lbl.split("/")[1] : "";
      // mapped.label は 日本語 ("怒り"など)
      // 例: "怒り(angry)"
      return `${mapped.label}(${engPart})`;
    }
  });
}
