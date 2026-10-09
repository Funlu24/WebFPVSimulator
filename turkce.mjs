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
import { readFileSync, writeFileSync } from 'node:fs';

const FILE = process.argv[2] || 'src/ui/ui.js';

/* Kaynak koddaki tek tirnakli yazi icin kacis: ' -> \' */
const esc = (s) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

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
    const repl = `${prop}: '${esc(tr)}'`;
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
    src = parts.join(tr);
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
