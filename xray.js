/* ===========================================================================
   AvSec — модуль «Распознавание на рентгене».
   Сцены — собственная векторная имитация снимка интроскопа с ПРАВИЛЬНОЙ
   цветовой кодировкой досмотровой техники:
     • оранжевый — органика (взрывчатка, еда, ткань, пластик, жидкости);
     • синий     — металл (оружие, инструменты);
     • зелёный   — неорганика / смешанные материалы;
     • чёрный    — плотные объекты, непрозрачные для луча.
   Собственный контент — без сторонних датасетов и лицензионных ограничений.

   ДОБАВЛЕНИЕ РЕАЛЬНЫХ СНИМКОВ (когда получены законно от аэропорта):
   в объект сцены вместо "svg" укажите  img: "./xray/имя.jpg"  — размеры
   подгоняются по viewBox (vw × vh), координаты целей задаются в тех же единицах.
   =========================================================================== */
var XRAY = (function () {
  var ORG = "#e8912f", ORG_D = "#b96a12";      // органика
  var MET = "#4a86c8", MET_D = "#1f4f86";      // металл
  var INO = "#4fa564";                          // неорганика
  var DENSE = "#0d1a2b";                        // плотный металл

  /* --- элементы снимка (силуэты) --- */
  function gun(x, y, s) {
    return '<g transform="translate(' + x + ',' + y + ') scale(' + s + ')">' +
      '<path d="M2,10 L54,10 L54,21 L41,21 L39,27 L31,27 L29,21 L21,21 L19,44 L5,44 L8,21 L2,21 Z" fill="' + MET + '" stroke="' + DENSE + '" stroke-width="1.5"/>' +
      '<rect x="6" y="12" width="44" height="4" fill="' + DENSE + '" opacity=".65"/>' +
      '<circle cx="26" cy="24" r="3" fill="' + DENSE + '" opacity=".8"/></g>';
  }
  function knife(x, y, s, rot) {
    return '<g transform="translate(' + x + ',' + y + ') rotate(' + (rot || 0) + ') scale(' + s + ')">' +
      '<path d="M0,4 L44,0 L50,5 L44,10 L0,10 Z" fill="' + MET + '" stroke="' + DENSE + '" stroke-width="1.2"/>' +
      '<rect x="-22" y="2" width="24" height="8" rx="2" fill="' + DENSE + '" opacity=".85"/></g>';
  }
  function scissors(x, y, s, rot) {
    return '<g transform="translate(' + x + ',' + y + ') rotate(' + (rot || 0) + ') scale(' + s + ')">' +
      '<path d="M4,14 L40,2 L44,7 L8,19 Z" fill="' + MET + '" stroke="' + DENSE + '" stroke-width="1"/>' +
      '<path d="M4,6 L40,18 L44,13 L8,1 Z" fill="' + MET + '" stroke="' + DENSE + '" stroke-width="1"/>' +
      '<circle cx="-2" cy="2" r="5" fill="none" stroke="' + MET_D + '" stroke-width="3"/>' +
      '<circle cx="-2" cy="18" r="5" fill="none" stroke="' + MET_D + '" stroke-width="3"/></g>';
  }
  function bottle(x, y, s) {
    return '<g transform="translate(' + x + ',' + y + ') scale(' + s + ')">' +
      '<path d="M9,0 h12 v7 q9,5 9,15 v33 q0,6 -6,6 h-18 q-6,0 -6,-6 v-33 q0,-10 9,-15 z" fill="' + ORG + '" stroke="' + ORG_D + '" stroke-width="1.5"/>' +
      '<rect x="7" y="0" width="16" height="5" fill="' + INO + '"/></g>';
  }
  function aerosol(x, y, s) {
    return '<g transform="translate(' + x + ',' + y + ') scale(' + s + ')">' +
      '<rect x="0" y="6" width="20" height="42" rx="6" fill="' + INO + '" stroke="' + MET_D + '" stroke-width="1.4"/>' +
      '<rect x="6" y="0" width="8" height="8" fill="' + MET + '"/>' +
      '<rect x="2" y="16" width="16" height="18" fill="' + ORG + '" opacity=".55"/></g>';
  }
  function lighter(x, y, s) {
    return '<g transform="translate(' + x + ',' + y + ') scale(' + s + ')">' +
      '<rect x="0" y="4" width="13" height="24" rx="3" fill="' + ORG + '" stroke="' + ORG_D + '" stroke-width="1.2"/>' +
      '<rect x="4" y="0" width="6" height="5" fill="' + MET + '"/></g>';
  }
  function laptop(x, y, s) {
    return '<g transform="translate(' + x + ',' + y + ') scale(' + s + ')">' +
      '<rect x="0" y="0" width="54" height="34" rx="2" fill="' + INO + '" opacity=".85" stroke="' + MET_D + '" stroke-width="1.2"/>' +
      '<rect x="4" y="4" width="46" height="26" fill="' + DENSE + '" opacity=".55"/>' +
      '<rect x="-4" y="34" width="62" height="6" rx="2" fill="' + MET + '" opacity=".8"/></g>';
  }
  function book(x, y, w, h, rot) {
    return '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="2" fill="' + ORG + '" opacity=".62" ' +
      'transform="rotate(' + (rot || 0) + ',' + (x + w / 2) + ',' + (y + h / 2) + ')"/>';
  }
  function cloth(x, y, rx, ry) {
    return '<ellipse cx="' + x + '" cy="' + y + '" rx="' + rx + '" ry="' + ry + '" fill="' + ORG + '" opacity=".38"/>';
  }
  function cable(x, y) {
    return '<path d="M' + x + ',' + y + ' q14,-12 28,0 q14,12 28,0" fill="none" stroke="' + INO + '" stroke-width="4" opacity=".8"/>';
  }
  function coins(x, y) {
    return '<g>' + [0, 1, 2].map(function (i) {
      return '<circle cx="' + (x + i * 11) + '" cy="' + (y + (i % 2) * 5) + '" r="5" fill="' + MET + '" opacity=".9"/>';
    }).join("") + '</g>';
  }
  function phone(x, y) {
    return '<rect x="' + x + '" y="' + y + '" width="17" height="30" rx="3" fill="' + INO + '" stroke="' + MET_D + '" stroke-width="1.2"/>';
  }

  /* --- каркас сумки --- */
  function bag(inner) {
    return '<svg viewBox="0 0 400 260" xmlns="http://www.w3.org/2000/svg" class="xrsvg">' +
      '<defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0" stop-color="#0a1119"/><stop offset="1" stop-color="#060b12"/></linearGradient></defs>' +
      '<rect width="400" height="260" fill="url(#bg)"/>' +
      '<rect x="14" y="18" width="372" height="228" rx="16" fill="#0f1a26" stroke="#24405c" stroke-width="2"/>' +
      '<path d="M170,18 q30,-14 60,0" fill="none" stroke="#24405c" stroke-width="6"/>' +
      inner + '</svg>';
  }

  /* --- сцены --- */
  var SCENES = [
    {
      id: "gun1",
      title: "Ручная кладь пассажира",
      task: "Найдите запрещённый предмет",
      svg: bag(
        cloth(110, 90, 62, 40) + cloth(280, 170, 55, 34) +
        book(60, 150, 60, 44, -8) + book(250, 60, 52, 38, 6) +
        laptop(190, 150, 1) + coins(90, 60) +
        gun(215, 62, 1.25)
      ),
      targets: [{ x: 212, y: 58, w: 78, h: 62, name: "Пистолет",
        why: "Огнестрельное оружие — категорически запрещено к перевозке в ручной клади. Металл на снимке даёт синий цвет и характерный силуэт: ствол + рукоятка." }],
      hint: "Ищите синий (металлический) предмет с характерным силуэтом."
    },
    {
      id: "knife1",
      title: "Сумка ручной клади",
      task: "Найдите запрещённый предмет",
      svg: bag(
        cloth(120, 180, 70, 42) + book(56, 60, 58, 42, 5) +
        phone(300, 80) + cable(240, 190) + coins(150, 70) +
        cloth(300, 170, 46, 30) +
        knife(150, 120, 1.15, -12)
      ),
      targets: [{ x: 122, y: 105, w: 92, h: 42, name: "Нож",
        why: "Колюще-режущие предметы запрещены в ручной клади. На снимке — вытянутый синий силуэт с тёмной (плотной) рукояткой." }],
      hint: "Вытянутый металлический предмет с рукояткой."
    },
    {
      id: "liquid1",
      title: "Ручная кладь · жидкости",
      task: "Найдите предмет, который не пройдёт по правилам ЖГА",
      svg: bag(
        cloth(100, 90, 58, 36) + book(240, 150, 56, 40, -6) +
        phone(320, 150) + coins(70, 180) + cable(180, 60) +
        bottle(160, 120, 1.5)
      ),
      targets: [{ x: 152, y: 116, w: 62, h: 92, name: "Бутылка жидкости",
        why: "Жидкости, гели и аэрозоли (ЖГА) в ручной клади — только в ёмкостях до 100 мл, уложенных в прозрачный пакет. Крупная ёмкость изымается. Жидкость — органика, на снимке оранжевая." }],
      hint: "Оранжевый (органический) объект характерной формы."
    },
    {
      id: "scissors1",
      title: "Ручная кладь · инструменты",
      task: "Найдите запрещённый предмет",
      svg: bag(
        cloth(300, 90, 52, 34) + book(60, 90, 56, 42, 4) +
        laptop(230, 160, 0.9) + coins(120, 200) + phone(70, 170) +
        scissors(150, 80, 1.2, 15)
      ),
      targets: [{ x: 140, y: 70, w: 78, h: 56, name: "Ножницы",
        why: "Ножницы с длиной лезвия свыше установленного предела запрещены в ручной клади. На снимке — две скрещённые металлические полосы с кольцами ручек." }],
      hint: "Две скрещённые металлические полосы."
    },
    {
      id: "aerosol1",
      title: "Ручная кладь · баллоны",
      task: "Найдите запрещённый предмет",
      svg: bag(
        cloth(110, 170, 62, 38) + book(250, 170, 54, 40, -5) +
        phone(90, 70) + cable(240, 70) + coins(310, 190) +
        aerosol(180, 96, 1.5) + lighter(140, 120, 1.1)
      ),
      targets: [
        { x: 174, y: 92, w: 44, h: 78, name: "Газовый баллончик",
          why: "Аэрозольные баллоны под давлением (в т.ч. газовые баллончики) относятся к опасным грузам и запрещены к перевозке в салоне." },
        { x: 136, y: 116, w: 32, h: 42, name: "Зажигалка",
          why: "Зажигалки и спички ограничены строгими правилами: как правило допускается не более одной зажигалки при себе, в багаж класть запрещено." }
      ],
      hint: "Здесь может быть больше одного нарушения."
    },
    {
      id: "clean1",
      title: "Ручная кладь · обычный пассажир",
      task: "Найдите запрещённый предмет — или подтвердите, что сумка чистая",
      svg: bag(
        laptop(160, 90, 1.15) + book(60, 70, 58, 44, 6) + book(70, 160, 52, 38, -4) +
        cloth(300, 100, 56, 38) + cloth(280, 190, 48, 28) +
        phone(320, 60) + cable(180, 190) + coins(130, 60)
      ),
      targets: [],
      clean: true,
      cleanWhy: "В этой сумке только ноутбук, книги, одежда, телефон, провода и монеты — запрещённых предметов нет. Уметь уверенно пропускать чистый багаж так же важно, как находить угрозу: ложные тревоги замедляют поток и снижают доверие к досмотру.",
      hint: "Возможно, нарушений нет — тогда нажмите «Нарушений нет»."
    }
  ];

  return { scenes: SCENES };
})();
