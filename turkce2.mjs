/*
 * turkce2.mjs: Türkçe çeviri betiği (2. aşama).
 *
 * 1. betik tek tırnaklı yazıları çevirdi. Bu betik kalanları çevirir:
 * cümle içine ${...} ile gömülü yazılar, başlık satırı ("..., süre denemesi"),
 * ekran başlıkları, quad adları, harita adları, sonuç ekranı ve pano notları.
 *
 * Çalıştırma (projenin ana klasöründe):
 *     node turkce2.mjs
 *
 * Güvenli: bulamadığı yazıyı atlar ve listeler, ikinci kez çalıştırmak zarar
 * vermez. Önce git commit yapın. Bozulursa "git checkout ." ile geri dönün
 * (dikkat: bu, commit edilmemiş tüm değişiklikleri siler, o yüzden önce commit).
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const BASE = process.argv[2] || '.';

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
  for (const [en, tr] of pairs) {
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
