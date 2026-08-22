const tg = window.Telegram?.WebApp;
if (tg) { tg.ready(); tg.expand(); }

const $ = id => document.getElementById(id);
const startBtn = $("startBtn");
const uploadScreen = $("uploadScreen");
const styleScreen = $("styleScreen");
const hero = document.querySelector(".hero");
const photoInput = $("photoInput");
const photoPreview = $("photoPreview");
const previewImg = $("previewImg");
const continueBtn = $("continueBtn");

startBtn.onclick = () => { hero.classList.add("hidden"); uploadScreen.classList.remove("hidden"); };
$("backBtn").onclick = () => { uploadScreen.classList.add("hidden"); hero.classList.remove("hidden"); };
$("styleBackBtn").onclick = () => { styleScreen.classList.add("hidden"); uploadScreen.classList.remove("hidden"); };

photoInput.onchange = e => {
  const file = e.target.files?.[0];
  if (!file) return;
  if (file.size > 10 * 1024 * 1024) {
    alert("Фото больше 10 МБ");
    photoInput.value = "";
    return;
  }
  previewImg.src = URL.createObjectURL(file);
  photoPreview.classList.remove("hidden");
  continueBtn.classList.remove("disabled");
};

continueBtn.onclick = () => {
  uploadScreen.classList.add("hidden");
  styleScreen.classList.remove("hidden");
};

document.querySelectorAll(".style").forEach(btn => {
  btn.onclick = () => {
    document.querySelectorAll(".style").forEach(x => x.classList.remove("active"));
    btn.classList.add("active");
  };
});

$("generateBtn").onclick = () => {
  alert("MVP готов: следующим этапом подключаем AI-генерацию.");
};
