/* Birleşik Türkçe yama: menüler, dinamik metinler ve harita adları. */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

{
/*
 * turkce.mjs: Turkce ceviri betigi (1. asama).
 *
 * Ne yapar: src/ui/ui.js icindeki menu yazilarini (label, note, text, title,
 * placeholder) Turkceye cevirir. Sadece ekranda gorunen yazilara dokunur.
 * action: 'back' gibi kodun ic adlarina DOKUNMAZ.
 *
 * Nasil calistirilir (projenin ana klasorunde):
 *     node turkce.mjs
 * Baska bir dosya icin:
 *     node turkce.mjs src/ui/credits.js
 *
 * Guvenli: bulamadigi yazilari atlar ve listeler. Iki kez calistirmak zarar
 * vermez (ikinci seferde hepsi "bulunamadi" olur). Calistirmadan once
 * git commit yapin, bozulursa "git checkout src/ui/ui.js" ile geri donersiniz.
 */

const FILE = process.argv[2] || 'src/ui/ui.js';

/* Kaynak koddaki tek tirnakli yazi icin kacis: ' -> \' */
const esc = (s) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
const fixEncoding = (s) => s;

/* label: '...' */
const LABELS = {
  'Your radio has no buttons this browser can see': 'Kumandanızın bu tarayıcının görebildiği düğmesi yok',
  'This browser is guessing your stick order': 'Bu tarayıcı çubuk sıranızı tahmin ediyor',
  'This browser cannot see your yaw stick': 'Bu tarayıcı yaw çubuğunuzu göremiyor',
  'This browser has your throttle as yaw': 'Bu tarayıcı gazınızı yaw olarak görüyor',
  'This browser calls your radio a gamepad': 'Bu tarayıcı kumandanızı oyun kolu sanıyor',
  'Back to the builder': 'Oluşturucuya dön',
  'Post a time': 'Süre gönder',
  'Published': 'Yayınlandı',
  'Publish this track': 'Bu pisti yayınla',
  'Update this track': 'Bu pisti güncelle',
  'Edit a copy': 'Kopyasını düzenle',
  'Edit this track': 'Bu pisti düzenle',
  'Fly it': 'Uç',
  'Back to the list': 'Listeye dön',
  'Open in the builder': 'Oluşturucuda aç',
  'Standings': 'Sıralama',
  'This track on Tracks and times': 'Bu pist, Pistler ve süreler sayfasında',
  'Rates': 'Oranlar',
  'Flight feel': 'Uçuş hissi',
  'Input to screen': 'Girişten ekrana',
  'Five inch racing': 'Beş inç yarış',
  'Whoop racing': 'Whoop yarışı',
  'Builder': 'Oluşturucu',
  'Weight, how heavy the quad feels': 'Ağırlık, quadın ne kadar ağır hissettirdiği',
  'Ghost': 'Hayalet',
  'Floppy': 'Gevşek',
  'Soft': 'Yumuşak',
  'About right': 'Tam kararında',
  'Stiff': 'Sert',
  'Twitchy': 'Tepkisel',
  'Slow to answer the stick': 'Çubuğa geç cevap veriyor',
  'Bounces back after a stop': 'Durunca geri sekiyor',
  'Wobbles in propwash': 'Propwash içinde sallanıyor',
  'Drifts off attitude': 'Duruşundan kayıyor',
  'Yaw is lazy': 'Yaw tembel',
  'Throttle is touchy': 'Gaz çok hassas',
  'Floaty, carries too far': 'Süzülüyor, fazla uzağa taşıyor',
  'Locked in, no complaints': 'Oturmuş, şikayet yok',
  'Map': 'Harita',
  'Track': 'Pist',
  'First flight': 'İlk uçuş',
  'Fly': 'Uç',
  'Settings': 'Ayarlar',
  'How to fly': 'Nasıl uçulur',
  'Tracks and times': 'Pistler ve süreler',
  'About': 'Hakkında',
  'Back': 'Geri',
  'Calibrate sticks': 'Çubukları kalibre et',
  'Check sticks': 'Çubukları kontrol et',
  'Choose joystick': 'Joystick seç',
  'Partners': 'İş ortakları',
  'Support': 'Web sitemiz',
  'Report a bug': 'Hata bildir',
  'Build a track': 'Pist oluştur',
  'Before you fly': 'Uçmadan önce',
  'Build a map': 'Harita oluştur',
  'The machine': 'Makine',
  'Firmware bench': 'Firmware tezgahı',
  'Camera': 'Kamera',
  'Flight': 'Uçuş',
  'You': 'Siz',
  'Your name': 'Adınız',
  'Sticks': 'Çubuklar',
  'Stick help': 'Çubuk yardımı',
  'Restart switch': 'Yeniden başlatma anahtarı',
  'Forget restart switch': 'Yeniden başlatma anahtarını unut',
  'Screen': 'Ekran',
  'Advanced': 'Gelişmiş',
  'Sound': 'Ses',
  'Picture and latency': 'Görüntü ve gecikme',
  'Diagnostics': 'Tanılama',
  'Download flight log': 'Uçuş kaydını indir',
  'No track chosen': 'Pist seçilmedi',
  'Fly this track': 'Bu pistte uç',
  'Chase the record': 'Rekorun peşine düş',
  'What this run counts as': 'Bu uçuşun sayılma koşulları',
  'Resume': 'Devam et',
  'Restart run': 'Uçuşu yeniden başlat',
  'Does it feel wrong?': 'Hissi yanlış mı?',
  'Elsewhere': 'Diğer',
  'Quit to title': 'Ana ekrana çık',
  'Fly again': 'Tekrar uç',
  'Post this run': 'Bu uçuşu gönder',
  'Back to title': 'Ana ekrana dön',
  'Preset': 'Ön ayar',
  'Throttle': 'Gaz',
  'Presets': 'Ön ayarlar',
  'Not saved': 'Kaydedilmedi',
  'Save as preset': 'Ön ayar olarak kaydet',
  'Delete preset': 'Ön ayarı sil',
  'Revert to defaults': 'Varsayılana dön',
  "Betaflight's tuning sliders": 'Betaflight ayar kaydırıcıları',
  "Back to the tune's own values": 'Tune değerlerine geri dön',
  'Stick path': 'Çubuk yolu',
  'Flying': 'Uçan',
};

/* note: '...' (sadece tek satirlik olanlar) */
const NOTES = {
  'Opens your map in the builder. Fly this map in there brings you straight back to it.':
    'Haritanızı oluşturucuda açar. Orada haritada uçmayı seçerseniz doğrudan buraya döner.',
  'Only a track on the board can hold a time. Publish this one first.':
    'Bir süreyi yalnızca panodaki bir pist tutabilir. Önce bu pisti yayınlayın.',
  'The layout has changed since it was published. Update the track on the board first.':
    'Yayınlandığından beri yerleşim değişti. Önce panodaki pisti güncelleyin.',
  'This track is on the public board. Opens its page.':
    'Bu pist herkese açık panoda. Sayfasını açar.',
  'The layout changed. Updating the board will clear posted times, then you can post a time.':
    'Yerleşim değişti. Panoyu güncellemek gönderilen süreleri siler, sonra süre gönderebilirsiniz.',
  'Already on the board, and nothing has changed since.':
    'Zaten panoda ve o zamandan beri bir şey değişmedi.',
  'Somebody else published this one. Edit a copy to put your own version on the board.':
    'Bunu başkası yayınladı. Kendi sürümünüzü panoya koymak için kopyasını düzenleyin.',
  'Open this track in the builder. A rename updates the name on the board. A layout change asks before clearing times.':
    'Bu pisti oluşturucuda açar. Yeniden adlandırma panodaki adı günceller. Yerleşim değişikliği, süreleri silmeden önce sorar.',
  'Tell the tune work how the quad flies. One word is enough; your tune, PID adjustment and rates go with it.':
    'Tune çalışmasına quadın nasıl uçtuğunu söyleyin. Bir kelime yeter; tune, PID ayarınız ve rates birlikte gelir.',
  'Read from the WebGL context that is drawing the world.':
    'Dünyayı çizen WebGL bağlamından okunur.',
  'The machine. The aircraft, its tune and PIDs, camera angle, field of view, flight mode and the firmware bench, which is every Betaflight key the module compiles.':
    'Makine. Uçak, tune ve PID ayarları, kamera açısı, görüş alanı, uçuş modu ve derlenen her Betaflight anahtarını içeren firmware tezgahı.',
  'You and your radio. Your name, choosing a joystick, Calibrate sticks, rates, graphics and sound.':
    'Siz ve kumandanız. Adınız, joystick seçimi, çubukların kalibrasyonu, oranlar, grafik ve ses.',
  'The sticks, live, and what the keys do.':
    'Çubuklar canlı ve tuşların ne yaptığı.',
  'Every published track and map, the times flown on them and who flew them. Opens in a new tab.':
    'Yayınlanmış her pist ve harita, üzerlerinde uçulan süreler ve kimlerin uçtuğu. Yeni sekmede açılır.',
  'Who made this and whose work it stands on, the partners who back it, Patreon, the FPV wiki, and reporting a bug.':
    'Bunu kimin yaptığı ve kimlerin çalışmasına dayandığı, destekçiler, FPV wiki ve hata bildirme.',
  'The cards: five inch racing, whoop racing, freestyle and the builder. Changing your mind about any of it starts here.':
    'Kartlar: beş inç yarış, whoop yarışı, freestyle ve oluşturucu. Fikrinizi değiştirirseniz buradan başlarsınız.',
  'The closed loop, the plant, and every Betaflight 4.5.1 key. Opens the wiki on webfpv.org.':
    'Kapalı döngü, plant ve her Betaflight 4.5.1 anahtarı. Wiki webfpv.org adresinde açılır.',
  'Something wrong, or something to say: the form takes a title and a sentence, and sends the map, graphics and browser with it. F8 opens it from anywhere.':
    'Bir sorun ya da söyleyecek bir şey: form bir başlık ve bir cümle alır, haritayı, grafik ayarlarını ve tarayıcıyı birlikte gönderir. F8 her yerden açar.',
  'Laps, pack charge, flight model, radio link and the ghost: what this run counts as. Opens the launch card, which has its own Fly.':
    'Tur sayısı, pil şarjı, uçuş modeli, radyo bağlantısı ve hayalet: bu uçuşun neye sayıldığı. Kendi Uç düğmesi olan açılış kartını açar.',
  'Its page on the public board, opened on this track. A link to send somebody. Opens in a new tab.':
    'Genel panodaki sayfası, bu pistte açılır. Birine gönderebileceğiniz bir bağlantı. Yeni sekmede açılır.',
  'Opens the builder on the freestyle canvas. Place buildings, a crane, containers, a skate set and named gaps, then fly it here as Your map.':
    'Oluşturucuyu freestyle tuvalinde açar. Bina, vinç, konteyner, kaykay seti ve adlandırılmış boşluklar yerleştirin, sonra burada Haritanız olarak uçun.',
  'Centre, full range, then one named move per stick. Saved after you check it.':
    'Merkez, tam hareket, sonra her çubuk için adı verilmiş bir hareket. Kontrol ettikten sonra kaydedilir.',
  'R on the keyboard still restarts.':
    'Klavyede R yine yeniden başlatır.',
  'Render scale, frame cap, low latency and predicted view, frame pacing, what reaches the screen how fast, and the flight log. For when something is wrong; Auto looks after the picture otherwise.':
    'Render ölçeği, kare sınırı, düşük gecikme ve tahmin edilen görüntü, kare ritmi, ekrana neyin ne kadar hızlı ulaştığı ve uçuş kaydı. Bir şey ters gittiğinde içindir; Auto aksi halde görüntüyü kendisi halleder.',
  'Writes what was recorded as blackbox_decode CSV, which scripts/replay-log.js reads.':
    'Kaydedileni blackbox_decode CSV olarak yazar, scripts/replay-log.js bunu okur.',
  'Pick a track in the Race room and open its standings from there.':
    'Yarış odasında bir pist seçin ve sıralamasını oradan açın.',
  "How far the sticks go, and the throttle limit. Yours, not the tune's. Changing them here leaves the quad where it is and the clock running.":
    'Çubukların ne kadar gittiği ve gaz sınırı. Bunlar sizin, tune ayarının değil. Burada değiştirmek quadı olduğu yerde, saati çalışır halde bırakır.',
  'Your name, your radio, graphics and sound.':
    'Adınız, kumandanız, grafik ve ses.',
  'Every published track and map, and the times flown on them. Opens in a new tab.':
    'Yayınlanmış her pist ve harita ve üzerlerinde uçulan süreler. Yeni sekmede açılır.',
  'The tune is being fetched and applied. Its sliders appear the moment the module reads back.':
    'Tune getiriliyor ve uygulanıyor. Kaydırıcıları, modül geri okuduğu anda görünür.',
  'The Firmware bench: filters, features and every firmware key, not just the PIDs. Configurator-shaped. No CLI paste.':
    'Firmware tezgahı: filtreler, özellikler ve yalnızca PID değil, her firmware anahtarı. Configurator biçiminde. CLI yapıştırma yok.',
};

/* text: '...' (alt satirdaki tus ipuclari) */
const TEXTS = {
  'Back': 'Geri',
  'Move': 'Hareket',
  'Adjust': 'Ayarla',
  'Choose': 'Seç',
  'Fly': 'Uç',
};

/* title: '...' ve placeholder: '...' */
const TITLES = {
  'Name this preset': 'Ön ayara ad ver',
  'Yaw will roll the horizon': 'Yaw ufku yatıracak',
};
const PLACEHOLDERS = {
  'Name': 'Ad',
  'Preset name': 'Ön ayar adı',
};

/* Tek basina duran yazi: keys: ['Double click'] gibi */
const RAW = {
  "['Double click']": "['Çift tık']",
};

let src = readFileSync(FILE, 'utf8');
let total = 0;
const missing = [];

function apply(prop, map) {
  for (const [en, tr] of Object.entries(map)) {
    const needle = `${prop}: '${esc(en)}'`;
    const repl = `${prop}: '${esc(fixEncoding(tr))}'`;
    const parts = src.split(needle);
    const n = parts.length - 1;
    if (n === 0) {
      missing.push(`${prop}: ${en.slice(0, 60)}`);
    } else {
      src = parts.join(repl);
      total += n;
    }
  }
}

apply('label', LABELS);
apply('note', NOTES);
apply('text', TEXTS);
apply('title', TITLES);
apply('placeholder', PLACEHOLDERS);
for (const [en, tr] of Object.entries(RAW)) {
  const parts = src.split(en);
  if (parts.length > 1) {
    src = parts.join(fixEncoding(tr));
    total += parts.length - 1;
  } else {
    missing.push(`raw: ${en}`);
  }
}

writeFileSync(FILE, src, 'utf8');
console.log(`${FILE}: ${total} yazı Türkçeye çevrildi.`);
if (missing.length) {
  console.log(`\nBulunamayan ${missing.length} yazı (daha önce çevrilmiş ya da silinmiş olabilir):`);
  for (const m of missing) {
    console.log('  - ' + m);
  }
}
console.log('\nSıradaki adım: index.html içinde <html lang="en"> satırını <html lang="tr"> yapın.');

}
{
/*
 * turkce.mjs: Türkçe çeviri betiği (2. aşama).
 *
 * 1. betik tek tırnaklı yazıları çevirdi. Bu betik kalanları çevirir:
 * cümle içine ${...} ile gömülü yazılar, başlık satırı ("..., süre denemesi"),
 * ekran başlıkları, quad adları, harita adları, sonuç ekranı ve pano notları.
 *
 * Çalıştırma (projenin ana klasöründe):
 *     node turkce.mjs
 *
 * Güvenli: bulamadığı yazıyı atlar ve listeler, ikinci kez çalıştırmak zarar
 * vermez. Önce git commit yapın. Bozulursa "git checkout ." ile geri dönün
 * (dikkat: bu, commit edilmemiş tüm değişiklikleri siler, o yüzden önce commit).
 */

const BASE = process.argv[2] || '.';
const fixEncoding = (s) => s;

/* ---------------------------------------------------------------- ui.js */
const UI = [
  /* Başlık ekranı: alt başlık ve satırlar */
  ['`${worldName}, no gates`', '`${worldName}, kapısız`'],
  ['`${worldName}, time trial`', '`${worldName}, süre denemesi`'],
  ["textContent = 'No lap recorded yet'", "textContent = 'Henüz tur kaydedilmedi'"],
  ["(world ? world.name : 'Not loaded')", "(world ? world.name : 'Yüklenmedi')"],
  ["seat.name : 'Choose one'", "seat.name : 'Birini seçin'"],

  /* Uç satırının açıklaması */
  [
    "Straight to the starting blocks${seat && seat.name ? ` of ${seat.name}` : ''}, set up as last time. Before you fly is under the track in Tracks.",
    "Doğrudan ${seat && seat.name ? `${seat.name} pistinin ` : ''}başlangıç çizgisine, ayarlar geçen seferki gibi. Uçmadan önce kartı Pistler altında, pistin içindedir.",
  ],
  [
    "'Before you fly first: the laps, the pack and what this run counts as, then the grid. Once per track each visit.'",
    "'Önce Uçmadan önce kartı: turlar, pil ve bu uçuşun neye sayıldığı, sonra başlangıç ızgarası. Her ziyarette pist başına bir kez.'",
  ],
  [
    '`${seat.name}, levelled off, with the sticks drawn on screen and a prompt at each step.`',
    '`${seat.name}, dengelenmiş halde, çubuklar ekranda çizili ve her adımda bir yönerge.`',
  ],
  [
    "'Levelled off, with the sticks drawn on screen and a prompt at each step.'",
    "'Dengelenmiş halde, çubuklar ekranda çizili ve her adımda bir yönerge.'",
  ],

  /* Harita ve Pist satırı notları */
  ['`, built by ${shared.author}`', '`, yapan ${shared.author}`'],
  [', from the board. Your quad and the physics model are in here.', ', panodan. Quadınız ve fizik modeli burada.'],
  ['`${world.note} Your quad and the physics model are in here.`', '`${world.note} Quadınız ve fizik modeli burada.`'],
  [
    ', and every other track. Gated, against the clock, and a lap flown here can go on the board.',
    ', ve diğer tüm pistler. Kapılı, zamana karşı ve burada uçulan bir tur panoya gönderilebilir.',
  ],
  [
    "'No track is seated yet. Your own tracks, every track the board is offering, and the builder, are in here.'",
    "'Henüz seçili pist yok. Kendi pistleriniz, panonun sunduğu tüm pistler ve oluşturucu burada.'",
  ],

  /* Ekran başlıkları (üstteki yazı) */
  [
    "  courses: 'Tracks',\n  freestyle: 'Maps',\n  pilot: 'Settings',\n  quad: 'Quad',\n  launch: 'Before you fly',\n  standings: 'Standings',\n  rates: 'Rates',\n  pids: 'Tune',\n  fc: 'Firmware bench',\n  paused: 'Paused',\n  results: 'Run complete',\n  howto: 'How to fly',\n  tricks: 'Trick list',\n  credits: 'About',\n  stickhelp: 'Stick help',\n  advanced: 'Advanced',\n  calibrate: 'Calibrate sticks',\n  padpick: 'Choose joystick',\n};",
    "  courses: 'Pistler',\n  freestyle: 'Haritalar',\n  pilot: 'Ayarlar',\n  quad: 'Quad',\n  launch: 'Uçmadan önce',\n  standings: 'Sıralama',\n  rates: 'Oranlar',\n  pids: 'Tune',\n  fc: 'Firmware tezgahı',\n  paused: 'Duraklatıldı',\n  results: 'Uçuş tamamlandı',\n  howto: 'Nasıl uçulur',\n  tricks: 'Trick listesi',\n  credits: 'Hakkında',\n  stickhelp: 'Çubuk yardımı',\n  advanced: 'Gelişmiş',\n  calibrate: 'Çubukları kalibre et',\n  padpick: 'Joystick seç',\n};",
  ],
  [
    "  courses: ['Tracks'],\n  freestyle: ['Maps'],\n  pilot: ['Settings'],\n  quad: ['Quad'],\n  launch: ['Before you fly'],\n  standings: ['Tracks', 'Standings'],\n  rates: ['Settings', 'Rates'],\n  pids: ['Quad', 'Tune'],\n  fc: ['Quad', 'Firmware bench'],\n  paused: ['Paused'],\n  results: ['Run complete'],\n  howto: ['How to fly'],\n  tricks: ['Maps', 'Trick list'],\n  credits: ['About'],\n  stickhelp: ['Settings', 'Stick help'],\n  advanced: ['Settings', 'Advanced'],\n  calibrate: ['Settings', 'Calibrate sticks'],\n  padpick: ['Settings', 'Choose joystick'],",
    "  courses: ['Pistler'],\n  freestyle: ['Haritalar'],\n  pilot: ['Ayarlar'],\n  quad: ['Quad'],\n  launch: ['Uçmadan önce'],\n  standings: ['Pistler', 'Sıralama'],\n  rates: ['Ayarlar', 'Oranlar'],\n  pids: ['Quad', 'Tune'],\n  fc: ['Quad', 'Firmware tezgahı'],\n  paused: ['Duraklatıldı'],\n  results: ['Uçuş tamamlandı'],\n  howto: ['Nasıl uçulur'],\n  tricks: ['Haritalar', 'Trick listesi'],\n  credits: ['Hakkında'],\n  stickhelp: ['Ayarlar', 'Çubuk yardımı'],\n  advanced: ['Ayarlar', 'Gelişmiş'],\n  calibrate: ['Ayarlar', 'Çubukları kalibre et'],\n  padpick: ['Ayarlar', 'Joystick seç'],",
  ],

  /* Sabit notlar */
  [
    "const FREESTYLE_SCORING_LABEL = { off: 'Lines only', free: 'Free flight', scored: 'Scored run' };",
    "const FREESTYLE_SCORING_LABEL = { off: 'Sadece çizgiler', free: 'Serbest uçuş', scored: 'Puanlı uçuş' };",
  ],
  [
    "'Tracks you build stay in this browser. Clearing it, or another device, starts you from nothing. Publish a track to put it on the public board.'",
    "'Oluşturduğunuz pistler bu tarayıcıda kalır. Tarayıcı verisini silmek ya da başka bir cihaz kullanmak sıfırdan başlatır. Herkese açık panoya koymak için bir pist yayınlayın.'",
  ],
  [
    "'Choose it to see what you can do with it, or double click it to fly it.'",
    "'Ne yapabileceğinizi görmek için seçin, uçmak için çift tıklayın.'",
  ],
  [
    "' Changing it during a run puts the quad back on the start line.'",
    "' Uçuş sırasında değiştirmek quadı başlangıç çizgisine geri koyar.'",
  ],

  /* Pist kartları */
  [
    "`${chip.note} ${seat.gates} gate${seat.gates === 1 ? '' : 's'}. ${CARD_PRESS_NOTE}`",
    '`${chip.note} ${seat.gates} kapı. ${CARD_PRESS_NOTE}`',
  ],
  [
    "`Yours, saved in this browser. ${t.gates} gate${t.gates === 1 ? '' : 's'}. ${CARD_PRESS_NOTE}`",
    '`Sizin, bu tarayıcıda kayıtlı. ${t.gates} kapı. ${CARD_PRESS_NOTE}`',
  ],
  [
    '`Tracks for the ${af.name.toLowerCase()}. Quad changes the aircraft.`',
    '`${af.name.toLowerCase()} için pistler. Quad uçağı değiştirir.`',
  ],

  /* Bildirim formu ve düğmeler */
  ["err.textContent = 'A title needs at least eight characters.'", "err.textContent = 'Başlık en az sekiz karakter olmalı.'"],
  ["err.textContent = 'Say what happened, at least a sentence.'", "err.textContent = 'Ne olduğunu anlatın, en az bir cümle.'"],
  ["err.textContent = 'Pick a word on the first row. One is enough.'", "err.textContent = 'İlk satırdan bir kelime seçin. Biri yeter.'"],
  ["send.textContent = 'Sending'", "send.textContent = 'Gönderiliyor'"],
  ["send.textContent = 'Send'", "send.textContent = 'Gönder'"],
  ["meta.textContent = 'An empty field in the builder'", "meta.textContent = 'Oluşturucuda boş bir saha'"],

  /* Pano (liste) notları */
  ["'That track is no longer saved in this browser.'", "'Bu pist artık bu tarayıcıda kayıtlı değil.'"],
  ["'This browser would not store that track.'", "'Bu tarayıcı o pisti saklamadı.'"],
  ["= 'Reading the board'", "= 'Pano okunuyor'"],
  ["'No published tracks on the board yet. Build one and publish it.'", "'Panoda henüz yayınlanmış pist yok. Bir tane oluşturup yayınlayın.'"],
  ["'The board is not answering, so only your own tracks are listed.'", "'Pano yanıt vermiyor, bu yüzden yalnızca kendi pistleriniz listeleniyor.'"],
  ["'The board is not answering, so only the town and your own map are listed.'", "'Pano yanıt vermiyor, bu yüzden yalnızca kasaba ve kendi haritanız listeleniyor.'"],
  ['`Loading ${m.name}`', '`${m.name} yükleniyor`'],
  ['`Loading ${track.name}`', '`${track.name} yükleniyor`'],
  [' could not be loaded from the board.`', ' panodan yüklenemedi.`'],
  [' could not be loaded. ${err.message ?? err}`', ' yüklenemedi. ${err.message ?? err}`'],
  ["'Preview unavailable.'", "'Önizleme yok.'"],

  /* Sonuç ekranı */
  ['${formatTime(fastest)}, a track record`', '${formatTime(fastest)}, pist rekoru`'],
  ['${formatTime(fastest)}, equals the record`', '${formatTime(fastest)}, rekora eşit`'],
  [
    '${formatTime(fastest)}, ${formatDelta(fastest - best)} off ${formatTime(best)}`',
    '${formatTime(fastest)}, ${formatDelta(fastest - best)} fark, rekor ${formatTime(best)}`',
  ],
  ['  previous ${formatTime(recordAtStart)}`', '  önceki ${formatTime(recordAtStart)}`'],
  ["'First record on this track'", "'Bu pistteki ilk rekor'"],
  ['`Equals the record  ${formatTime(best)}`', '`Rekora eşit  ${formatTime(best)}`'],
  [
    '${formatDelta(fastest - best)} off the record  ${formatTime(best)} to beat',
    '${formatDelta(fastest - best)} rekor farkı  ${formatTime(best)} geçilecek',
  ],
  ["resultsHeroCap.textContent = 'Score'", "resultsHeroCap.textContent = 'Skor'"],
  [' is on the public board. Post a time under your name to appear on it.', ' herkese açık panoda. Listede görünmek için adınızla bir süre gönderin.'],
  [' lives in this browser. Publish it to put it on the board, then you can post a time.', ' bu tarayıcıda duruyor. Panoya koymak için yayınlayın, sonra süre gönderebilirsiniz.'],
  [' has a layout that is not on the board yet. Update the track before posting a time.', ' yerleşimi henüz panoda değil. Süre göndermeden önce pisti güncelleyin.'],
  ['`Weight ${v}%`', '`Ağırlık ${v}%`'],
  ['`Step ${n} of ${view.stepCount}, ${view.title}`', '`Adım ${n} / ${view.stepCount}, ${view.title}`'],
];

/* -------------------------------------------------- configs/airframes.js */
const AIRFRAMES = [
  ["name: 'Five inch'", "name: 'Beş inç'"],
  ["short: '5 inch'", "short: '5 inç'"],
  [
    "'A 710 gram 6S freestyle and race quad. Eight and a half to one, forty metres a second, and a field big enough to use it.'",
    "'710 gram, 6S bir freestyle ve yarış quadı. Sekiz buçuğa bir, saniyede kırk metre ve onu kullanmaya yetecek büyüklükte bir saha.'",
  ],
  [
    "'A 65 mm ducted whoop indoors. The hall and its gates are built to match it, so what you see is a whoop through 28 inch gates.'",
    "'Kapalı alanda 65 mm kanallı bir whoop. Salon ve kapıları ona göre yapılmıştır, yani gördüğünüz 28 inçlik kapılardan geçen bir whoop.'",
  ],
];

/* ------------------------------------------------------ maps/registry.js */
const REGISTRY = [
  ["name: 'Track'", "name: 'Pist'"],
  ["name: 'The town'", "name: 'Kasaba'"],
  ["name: 'Your map'", "name: 'Haritanız'"],
  [
    "'A track from the board, or one you built. Opening the sim loads the most flown track.'",
    "'Panodan bir pist ya da kendi yaptığınız. Simülatörü açmak en çok uçulan pisti yükler.'",
  ],
  [
    "'A whole town. No gates, no lap, no clock. Roofs, alleys, a level crossing, and a works road out to a derelict factory and the municipal pool.'",
    "'Koca bir kasaba. Kapı yok, tur yok, saat yok. Çatılar, ara sokaklar, bir hemzemin geçit ve terk edilmiş bir fabrikaya ve belediye havuzuna giden bir servis yolu.'",
  ],
  [
    "'A freestyle map you built in the builder, or Hibari Yard, the starter yard, until you have built one.'",
    "'Oluşturucuda yaptığınız bir freestyle haritası, ya da siz yapana kadar başlangıç sahası Hibari Yard.'",
  ],
];

const JOBS = [
  ['src/ui/ui.js', UI],
  ['configs/airframes.js', AIRFRAMES],
  ['src/maps/registry.js', REGISTRY],
];

let grand = 0;
const missing = [];
for (const [rel, pairs] of JOBS) {
  const path = join(BASE, rel);
  if (!existsSync(path)) {
    console.log(`Dosya yok, atlandı: ${rel} (betiği projenin ana klasöründe çalıştırdınız mı?)`);
    continue;
  }
  let src = readFileSync(path, 'utf8');
  let count = 0;
  for (const [en, rawTr] of pairs) {
    const tr = fixEncoding(rawTr);
    const parts = src.split(en);
    const n = parts.length - 1;
    if (n === 0) {
      missing.push(`${rel}: ${en.replace(/\n/g, ' ').slice(0, 70)}`);
    } else {
      src = parts.join(tr);
      count += n;
    }
  }
  writeFileSync(path, src, 'utf8');
  console.log(`${rel}: ${count} yazı çevrildi.`);
  grand += count;
}
console.log(`\nToplam: ${grand}`);
if (missing.length) {
  console.log(`\nBulunamayan ${missing.length} yazı (daha önce çevrilmiş olabilir ya da dosyanız farklıdır):`);
  for (const m of missing) {
    console.log('  - ' + m);
  }
}

}
