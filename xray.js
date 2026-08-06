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
  /* Палитра двухэнергетического досмотрового монитора: светлый фон,
     объекты накладываются в режиме multiply — плотности суммируются, как на
     реальном просвечивающем снимке. */
  var ORG = "#f0921f", ORG_D = "#c46a08";      // органика — оранжевый
  var MET = "#2f6fb5", MET_D = "#17427a";      // металл — синий
  var INO = "#46a05a";                          // неорганика / смеси — зелёный
  var DENSE = "#101820";                        // непроницаемое — почти чёрный

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
    return '<ellipse cx="' + x + '" cy="' + y + '" rx="' + rx + '" ry="' + ry + '" fill="' + ORG + '" opacity=".3"/>';
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
  /* --- элементы для расширенных сцен --- */
  function battery(x, y, s) {
    s = s || 1;
    return '<g transform="translate(' + x + ',' + y + ') scale(' + s + ')">' +
      '<rect x="0" y="0" width="34" height="16" rx="2" fill="' + INO + '" stroke="' + MET_D + '" stroke-width="1.3"/>' +
      '<rect x="34" y="5" width="4" height="6" fill="' + MET + '"/>' +
      '<rect x="4" y="3" width="26" height="10" fill="' + DENSE + '" opacity=".45"/></g>';
  }
  function wires(x, y, s) {
    s = s || 1;
    return '<g transform="translate(' + x + ',' + y + ') scale(' + s + ')">' +
      '<path d="M0,6 q12,-10 24,0 q12,10 24,0" fill="none" stroke="' + MET + '" stroke-width="2.6" opacity=".95"/>' +
      '<path d="M0,12 q12,-10 24,0 q12,10 24,0" fill="none" stroke="' + ORG + '" stroke-width="2.6" opacity=".9"/></g>';
  }
  function detonator(x, y, s) {
    s = s || 1;
    return '<g transform="translate(' + x + ',' + y + ') scale(' + s + ')">' +
      '<rect x="0" y="0" width="9" height="26" rx="2" fill="' + MET + '" stroke="' + DENSE + '" stroke-width="1.2"/>' +
      '<rect x="2" y="16" width="5" height="9" fill="' + DENSE + '"/></g>';
  }
  function explosiveMass(x, y, w, h) {
    return '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="4" fill="' + ORG + '" ' +
      'stroke="' + ORG_D + '" stroke-width="2" opacity=".96"/>' +
      '<rect x="' + (x + 4) + '" y="' + (y + 4) + '" width="' + (w - 8) + '" height="' + (h - 8) + '" fill="' + ORG_D + '" opacity=".3"/>';
  }
  function ammo(x, y, n, s) {
    s = s || 1; var g = '';
    for (var i = 0; i < n; i++) {
      g += '<g transform="translate(' + (i * 11) + ',' + (i % 2) * 4 + ')">' +
        '<rect x="0" y="0" width="7" height="14" fill="' + MET + '" stroke="' + DENSE + '" stroke-width=".8"/>' +
        '<path d="M0,0 L3.5,-6 L7,0 Z" fill="' + DENSE + '"/></g>';
    }
    return '<g transform="translate(' + x + ',' + y + ') scale(' + s + ')">' + g + '</g>';
  }
  function taser(x, y, s) {
    s = s || 1;
    return '<g transform="translate(' + x + ',' + y + ') scale(' + s + ')">' +
      '<rect x="0" y="0" width="24" height="34" rx="4" fill="' + INO + '" stroke="' + MET_D + '" stroke-width="1.4"/>' +
      '<rect x="4" y="6" width="16" height="14" fill="' + MET + '" opacity=".85"/>' +
      '<rect x="4" y="-8" width="4" height="9" fill="' + MET + '"/><rect x="16" y="-8" width="4" height="9" fill="' + MET + '"/></g>';
  }
  function screwdriver(x, y, s, rot) {
    s = s || 1;
    return '<g transform="translate(' + x + ',' + y + ') rotate(' + (rot || 0) + ') scale(' + s + ')">' +
      '<rect x="0" y="3" width="34" height="5" fill="' + MET + '" stroke="' + DENSE + '" stroke-width=".8"/>' +
      '<rect x="34" y="0" width="18" height="11" rx="3" fill="' + ORG + '" opacity=".9"/></g>';
  }
  function boxcutter(x, y, s, rot) {
    s = s || 1;
    return '<g transform="translate(' + x + ',' + y + ') rotate(' + (rot || 0) + ') scale(' + s + ')">' +
      '<rect x="0" y="0" width="30" height="11" rx="2" fill="' + INO + '" stroke="' + MET_D + '" stroke-width="1.1"/>' +
      '<path d="M28,2 L42,2 L42,8 L28,9 Z" fill="' + MET + '" stroke="' + DENSE + '" stroke-width="1"/></g>';
  }
  function powerbank(x, y, s) {
    s = s || 1;
    return '<g transform="translate(' + x + ',' + y + ') scale(' + s + ')">' +
      '<rect x="0" y="0" width="40" height="20" rx="4" fill="' + INO + '" stroke="' + MET_D + '" stroke-width="1.3"/>' +
      '<rect x="4" y="4" width="14" height="12" fill="' + DENSE + '" opacity=".5"/>' +
      '<rect x="21" y="4" width="14" height="12" fill="' + DENSE + '" opacity=".5"/></g>';
  }
  function drone(x, y, s) {
    s = s || 1;
    return '<g transform="translate(' + x + ',' + y + ') scale(' + s + ')">' +
      '<rect x="14" y="14" width="26" height="18" rx="3" fill="' + INO + '" stroke="' + MET_D + '" stroke-width="1.3"/>' +
      '<rect x="18" y="18" width="18" height="10" fill="' + ORG + '" opacity=".7"/>' +
      ['0,0', '40,0', '0,40', '40,40'].map(function (p, i) {
        var c = p.split(","), cx = +c[0] + 7, cy = +c[1] + 7;
        return '<line x1="27" y1="23" x2="' + cx + '" y2="' + cy + '" stroke="' + MET + '" stroke-width="3"/>' +
          '<circle cx="' + cx + '" cy="' + cy + '" r="6" fill="none" stroke="' + MET + '" stroke-width="2.2"/>';
      }).join("") + '</g>';
  }

  /* --- элементы третьей серии сцен --- */
  function grenade(x, y, s) {
    s = s || 1;
    return '<g transform="translate(' + x + ',' + y + ') scale(' + s + ')">' +
      '<ellipse cx="16" cy="20" rx="14" ry="17" fill="' + MET + '" stroke="' + DENSE + '" stroke-width="1.6"/>' +
      '<rect x="10" y="0" width="12" height="7" rx="2" fill="' + DENSE + '"/>' +
      '<path d="M22,3 q9,4 6,16" fill="none" stroke="' + MET_D + '" stroke-width="3"/>' +
      '<circle cx="16" cy="20" r="7" fill="' + DENSE + '" opacity=".45"/></g>';
  }
  function baton(x, y, s, rot) {
    s = s || 1;
    return '<g transform="translate(' + x + ',' + y + ') rotate(' + (rot || 0) + ') scale(' + s + ')">' +
      '<path d="M0,4 L54,1 L58,5 L54,9 L0,7 Z" fill="' + MET + '" stroke="' + DENSE + '" stroke-width="1.2"/>' +
      '<rect x="-14" y="1" width="16" height="9" rx="3" fill="' + DENSE + '" opacity=".8"/></g>';
  }
  function knuckles(x, y, s) {
    s = s || 1;
    return '<g transform="translate(' + x + ',' + y + ') scale(' + s + ')">' +
      '<path d="M0,8 h44 a6,6 0 0 1 0,12 h-44 a6,6 0 0 1 0,-12 z" fill="' + MET + '" stroke="' + DENSE + '" stroke-width="1.4"/>' +
      [4, 15, 26, 37].map(function (cx) {
        return '<circle cx="' + (cx + 3) + '" cy="14" r="4.2" fill="#fbfaf6"/>';
      }).join("") + '</g>';
  }
  function machete(x, y, s, rot) {
    s = s || 1;
    return '<g transform="translate(' + x + ',' + y + ') rotate(' + (rot || 0) + ') scale(' + s + ')">' +
      '<path d="M0,2 L74,0 q10,6 8,16 L0,16 Z" fill="' + MET + '" stroke="' + DENSE + '" stroke-width="1.4"/>' +
      '<rect x="-26" y="3" width="28" height="12" rx="3" fill="' + DENSE + '" opacity=".85"/></g>';
  }
  function liBatteries(x, y, s) {
    s = s || 1; var g = '';
    for (var i = 0; i < 4; i++) {
      g += '<g transform="translate(' + (i % 2) * 26 + ',' + Math.floor(i / 2) * 20 + ')">' +
        '<rect x="0" y="0" width="22" height="15" rx="2" fill="' + INO + '" stroke="' + MET_D + '" stroke-width="1.2"/>' +
        '<rect x="3" y="3" width="16" height="9" fill="' + DENSE + '" opacity=".5"/></g>';
    }
    return '<g transform="translate(' + x + ',' + y + ') scale(' + s + ')">' + g + '</g>';
  }
  function replicaGun(x, y, s) {
    /* муляж: та же форма, но неметаллический — на снимке зелёный/оранжевый */
    return '<g transform="translate(' + x + ',' + y + ') scale(' + s + ')">' +
      '<path d="M2,10 L54,10 L54,21 L41,21 L39,27 L31,27 L29,21 L21,21 L19,44 L5,44 L8,21 L2,21 Z" ' +
      'fill="' + INO + '" stroke="' + MET_D + '" stroke-width="1.4" opacity=".92"/>' +
      '<rect x="8" y="13" width="34" height="3" fill="' + MET + '" opacity=".55"/></g>';
  }
  function shoe(x, y, s, hidden) {
    s = s || 1;
    return '<g transform="translate(' + x + ',' + y + ') scale(' + s + ')">' +
      '<path d="M0,26 q2,-20 22,-21 q16,-1 24,10 q10,8 24,10 q8,2 8,9 l-78,2 z" ' +
      'fill="' + ORG + '" opacity=".72" stroke="' + ORG_D + '" stroke-width="1.4"/>' +
      (hidden ? '<rect x="16" y="18" width="40" height="7" rx="1" fill="' + MET + '" stroke="' + DENSE + '" stroke-width="1.2"/>' : '') +
      '</g>';
  }
  function laptopIED(x, y, s) {
    s = s || 1;
    return '<g transform="translate(' + x + ',' + y + ') scale(' + s + ')">' +
      '<rect x="0" y="0" width="62" height="40" rx="3" fill="' + INO + '" opacity=".8" stroke="' + MET_D + '" stroke-width="1.3"/>' +
      '<rect x="6" y="6" width="26" height="28" fill="' + ORG + '" stroke="' + ORG_D + '" stroke-width="1.6"/>' +
      '<rect x="36" y="10" width="18" height="10" rx="2" fill="' + INO + '" stroke="' + MET_D + '" stroke-width="1.2"/>' +
      '<path d="M33,20 q6,-6 12,0" fill="none" stroke="' + MET + '" stroke-width="2"/>' +
      '<rect x="38" y="24" width="6" height="12" rx="1" fill="' + MET + '" stroke="' + DENSE + '" stroke-width="1"/></g>';
  }
  function food(x, y, s) {
    /* плотная органика с НЕоднородной структурой — не путать со взрывчаткой */
    s = s || 1;
    return '<g transform="translate(' + x + ',' + y + ') scale(' + s + ')">' +
      '<rect x="0" y="0" width="70" height="42" rx="8" fill="' + ORG + '" opacity=".8" stroke="' + ORG_D + '" stroke-width="1.5"/>' +
      [[9, 9], [26, 13], [44, 8], [16, 27], [36, 29], [54, 24], [58, 34]].map(function (p) {
        return '<ellipse cx="' + p[0] + '" cy="' + p[1] + '" rx="7" ry="5.5" fill="' + ORG_D + '" opacity=".45"/>';
      }).join("") + '</g>';
  }
  function syringes(x, y, s) {
    s = s || 1; var g = '';
    for (var i = 0; i < 3; i++) {
      g += '<g transform="translate(0,' + i * 12 + ')">' +
        '<rect x="0" y="0" width="30" height="8" rx="2" fill="' + INO + '" stroke="' + MET_D + '" stroke-width="1"/>' +
        '<rect x="30" y="3" width="12" height="2" fill="' + MET + '"/></g>';
    }
    return '<g transform="translate(' + x + ',' + y + ') scale(' + s + ')">' + g + '</g>';
  }

  /* --- каркас сумки --- */
  function bag(inner) {
    return '<svg viewBox="0 0 400 260" xmlns="http://www.w3.org/2000/svg" class="xrsvg">' +
      '<defs>' +
      /* зерно детектора */
      '<filter id="grain"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" result="n"/>' +
      '<feColorMatrix in="n" type="saturate" values="0"/>' +
      '<feComponentTransfer><feFuncA type="linear" slope="0.09"/></feComponentTransfer>' +
      '<feComposite operator="over" in2="SourceGraphic"/></filter>' +
      /* лёгкая нерезкость луча */
      '<filter id="soft"><feGaussianBlur stdDeviation="0.45"/></filter>' +
      '<linearGradient id="shell" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0" stop-color="#efe9dc"/><stop offset="1" stop-color="#e2dacb"/></linearGradient>' +
      '</defs>' +
      /* фон ленты — светлый, как на мониторе оператора */
      '<rect width="400" height="260" fill="#fbfaf6"/>' +
      '<g filter="url(#soft)">' +
      /* корпус сумки: сам по себе даёт слабое затемнение */
      '<rect x="14" y="18" width="372" height="228" rx="18" fill="url(#shell)" ' +
      'stroke="#c9bfab" stroke-width="2" style="mix-blend-mode:multiply"/>' +
      '<path d="M170,18 q30,-16 60,0" fill="none" stroke="#c9bfab" stroke-width="7" style="mix-blend-mode:multiply"/>' +
      /* застёжка-молния */
      '<line x1="26" y1="42" x2="374" y2="42" stroke="#b8ad97" stroke-width="1.6" ' +
      'stroke-dasharray="3 3" style="mix-blend-mode:multiply"/>' +
      /* содержимое — накладывается по плотности */
      '<g style="mix-blend-mode:multiply">' + inner + '</g>' +
      '</g>' +
      '<rect width="400" height="260" filter="url(#grain)" fill="none" pointer-events="none"/>' +
      '</svg>';
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
    },
    {
      id: "ied1",
      title: "Ручная кладь · подозрение на СВУ",
      task: "Найдите признаки самодельного взрывного устройства",
      svg: bag(
        cloth(90, 190, 56, 32) + book(300, 60, 50, 38, 5) + phone(60, 70) +
        explosiveMass(150, 100, 78, 46) + battery(158, 158, 1.1) +
        detonator(232, 104, 1.2) + wires(150, 152, 1.3)
      ),
      targets: [
        { x: 146, y: 96, w: 86, h: 54, name: "Масса ВВ",
          why: "Однородная органическая масса правильной формы без внутренней структуры — классический признак взрывчатого вещества. Органика на снимке оранжевая." },
        { x: 154, y: 154, w: 44, h: 22, name: "Источник питания",
          why: "Батарея рядом с проводами и однородной массой — элемент цепи инициирования." },
        { x: 228, y: 100, w: 20, h: 36, name: "Детонатор",
          why: "Мелкий плотный металлический цилиндр с проводами — средство инициирования." }
      ],
      hint: "Ищите связку: масса + батарея + провода + мелкий металлический цилиндр (схема «питание–инициатор–ВВ»)."
    },
    {
      id: "ammo1",
      title: "Ручная кладь · боеприпасы",
      task: "Найдите запрещённый предмет",
      svg: bag(
        cloth(300, 100, 54, 36) + book(60, 150, 58, 42, -6) +
        laptop(240, 150, 0.9) + phone(90, 70) + cable(200, 60) +
        ammo(140, 110, 5, 1.3)
      ),
      targets: [{ x: 134, y: 96, w: 82, h: 40, name: "Патроны",
        why: "Боеприпасы запрещены к перевозке в ручной клади. На снимке — группа одинаковых плотных объектов с характерной формой (гильза + пуля)." }],
      hint: "Несколько одинаковых мелких плотных объектов, уложенных рядом."
    },
    {
      id: "gunparts1",
      title: "Ручная кладь · разобранное оружие",
      task: "Найдите запрещённый предмет",
      svg: bag(
        cloth(110, 180, 60, 36) + book(280, 170, 52, 38, 4) + phone(320, 80) +
        cloth(80, 80, 48, 30) +
        '<g transform="translate(150,90)"><rect x="0" y="0" width="70" height="12" rx="2" fill="' + MET + '" stroke="' + DENSE + '" stroke-width="1.4"/><rect x="6" y="3" width="58" height="6" fill="' + DENSE + '" opacity=".6"/></g>' +
        '<g transform="translate(160,120)"><path d="M0,0 L26,0 L22,34 L4,34 Z" fill="' + MET + '" stroke="' + DENSE + '" stroke-width="1.4"/></g>' +
        '<g transform="translate(212,124)"><rect x="0" y="0" width="14" height="30" rx="2" fill="' + MET + '" stroke="' + DENSE + '" stroke-width="1.2"/><rect x="3" y="4" width="8" height="22" fill="' + DENSE + '" opacity=".7"/></g>'
      ),
      targets: [
        { x: 146, y: 86, w: 78, h: 22, name: "Ствол",
          why: "Оружие, разобранное на части, остаётся запрещённым предметом. Ствол — вытянутая металлическая трубка с внутренним каналом." },
        { x: 156, y: 116, w: 36, h: 42, name: "Рамка с рукояткой",
          why: "Разобранное оружие маскируют, распределяя части по багажу. Узнавайте детали по отдельности." },
        { x: 208, y: 120, w: 24, h: 38, name: "Магазин",
          why: "Магазин — прямоугольный плотный объект с внутренней структурой; часто перевозится отдельно от оружия." }
      ],
      hint: "Оружие может быть разобрано: ищите ствол, рамку и магазин по отдельности."
    },
    {
      id: "taser1",
      title: "Ручная кладь · средства поражения",
      task: "Найдите запрещённый предмет",
      svg: bag(
        cloth(300, 170, 52, 34) + book(70, 90, 56, 42, 6) +
        powerbank(240, 90, 1) + phone(120, 190) + coins(300, 70) +
        taser(160, 110, 1.3)
      ),
      targets: [{ x: 152, y: 96, w: 46, h: 62, name: "Электрошокер",
        why: "Электрошоковые устройства запрещены в ручной клади и в салоне. Признак — корпус с плотным блоком внутри и двумя металлическими контактами сверху." }],
      hint: "Корпус с металлическим блоком внутри и двумя выступающими контактами. Не путайте с повербанком.",
      decoyNote: "Повербанк рядом — разрешён (при ёмкости в пределах нормы)."
    },
    {
      id: "tools1",
      title: "Ручная кладь · инструменты",
      task: "Найдите запрещённые предметы",
      svg: bag(
        cloth(90, 190, 56, 32) + book(290, 90, 52, 40, -5) + phone(70, 80) +
        cable(230, 190) +
        screwdriver(140, 100, 1.15, 8) + boxcutter(150, 150, 1.1, -6)
      ),
      targets: [
        { x: 134, y: 92, w: 72, h: 30, name: "Отвёртка",
          why: "Инструменты длиной свыше установленного предела запрещены в ручной клади: металлический стержень с органической (оранжевой) рукояткой." },
        { x: 144, y: 144, w: 68, h: 26, name: "Канцелярский нож",
          why: "Любые предметы с выдвижным лезвием запрещены независимо от длины — компактный корпус с металлическим лезвием." }
      ],
      hint: "Нарушений может быть несколько: смотрите и на стержни, и на мелкие лезвия."
    },
    {
      id: "drone1",
      title: "Ручная кладь · беспилотник",
      task: "Найдите предмет, требующий особого контроля",
      svg: bag(
        cloth(90, 90, 50, 32) + book(300, 170, 50, 38, 5) + phone(70, 170) +
        drone(160, 90, 1.25)
      ),
      targets: [{ x: 156, y: 86, w: 76, h: 76, name: "Беспилотник с АКБ",
        why: "Беспилотные воздушные суда и их литиевые батареи — предмет особого контроля: батареи перевозятся только в ручной клади с ограничением по ёмкости, а сам БВС может требовать разрешения. На снимке — компактный корпус с лучами и кольцами защиты винтов." }],
      hint: "Симметричный объект с четырьмя лучами и батареей внутри."
    },
    {
      id: "clean2",
      title: "Ручная кладь · электроника",
      task: "Найдите запрещённый предмет — или подтвердите, что сумка чистая",
      svg: bag(
        laptop(150, 80, 1.2) + powerbank(250, 170, 1.1) +
        phone(90, 90) + cable(160, 190) + coins(300, 90) +
        cloth(80, 180, 46, 28) + book(300, 150, 48, 36, -4)
      ),
      targets: [],
      clean: true,
      cleanWhy: "Ноутбук, повербанк, телефон, провода и монеты разрешены к перевозке в ручной клади (повербанк — при ёмкости в пределах нормы и только в салоне). Запрещённых предметов нет. Уверенно пропускать чистый багаж — такой же навык, как находить угрозу.",
      hint: "Электроника сама по себе не запрещена. Проверьте, есть ли реальная угроза."
    },
    {
      id: "conceal1",
      title: "Ручная кладь · маскировка",
      task: "Найдите запрещённый предмет",
      svg: bag(
        cloth(300, 170, 52, 34) + phone(320, 80) + coins(80, 190) +
        '<rect x="120" y="80" width="110" height="80" rx="4" fill="' + ORG + '" opacity=".5" stroke="' + ORG_D + '" stroke-width="2"/>' +
        '<text x="132" y="76" fill="#5b7383" font-size="9" font-family="system-ui">книга</text>' +
        knife(140, 110, 1.05, 0)
      ),
      targets: [{ x: 118, y: 100, w: 96, h: 34, name: "Нож в книге",
        why: "Запрещённые предметы маскируют внутри бытовых вещей. Металл всегда даёт контрастный синий силуэт поверх органической (оранжевой) основы — обращайте внимание на «инородный» контур внутри однородного предмета." }],
      hint: "Ищите контрастный металлический силуэт внутри обычного предмета."
    },
    {
      id: "grenade1",
      title: "Ручная кладь · боеприпас",
      task: "Найдите запрещённый предмет",
      svg: bag(
        cloth(100, 190, 58, 34) + book(290, 80, 52, 40, -5) + phone(70, 90) +
        cable(230, 190) + coins(300, 180) +
        grenade(170, 100, 1.4)
      ),
      targets: [{ x: 164, y: 96, w: 52, h: 58, name: "Граната",
        why: "Боеприпасы и их имитаторы запрещены к перевозке. Признак — компактный плотный корпус овальной формы с рычагом и предохранительной чекой. Учебные и сувенирные образцы изымаются так же, как боевые." }],
      hint: "Компактный овальный металлический корпус с рычагом сверху."
    },
    {
      id: "blunt1",
      title: "Ручная кладь · ударно-дробящие предметы",
      task: "Найдите запрещённые предметы",
      svg: bag(
        cloth(300, 180, 50, 32) + book(60, 80, 54, 40, 5) + phone(320, 90) +
        baton(120, 90, 1.1, 12) + knuckles(150, 160, 1.2)
      ),
      targets: [
        { x: 100, y: 84, w: 84, h: 34, name: "Телескопическая дубинка",
          why: "Ударно-дробящие предметы запрещены в ручной клади. В сложенном виде дубинка короткая, но даёт плотный металлический силуэт с утолщением у рукоятки." },
        { x: 144, y: 154, w: 62, h: 30, name: "Кастет",
          why: "Кастет запрещён независимо от материала. Опознаётся по характерным отверстиям для пальцев в сплошной пластине." }
      ],
      hint: "Здесь два нарушения: вытянутый предмет и пластина с отверстиями."
    },
    {
      id: "machete1",
      title: "Багаж · крупный клинок",
      task: "Найдите запрещённый предмет",
      svg: bag(
        cloth(90, 200, 62, 34) + cloth(300, 190, 54, 32) +
        book(280, 70, 50, 38, 6) + phone(80, 80) +
        machete(120, 110, 1.25, -8)
      ),
      targets: [{ x: 86, y: 100, w: 132, h: 40, name: "Мачете",
        why: "Крупные клинковые предметы запрещены в ручной клади; в зарегистрированном багаже перевозятся только с соблюдением правил упаковки. Признак — длинное широкое металлическое полотно с массивной рукояткой." }],
      hint: "Длинное широкое металлическое полотно почти во всю сумку."
    },
    {
      id: "libatt1",
      title: "Ручная кладь · литиевые батареи",
      task: "Найдите предмет, требующий особого контроля",
      svg: bag(
        cloth(310, 100, 48, 32) + book(70, 180, 52, 38, -4) + phone(90, 80) +
        laptop(250, 160, 0.85) +
        liBatteries(150, 100, 1.25)
      ),
      targets: [{ x: 144, y: 94, w: 76, h: 56, name: "Литиевые батареи россыпью",
        why: "Литиевые батареи — опасный груз (риск теплового разгона и пожара). Перевозятся только в ручной клади, с защитой контактов от замыкания, с ограничением по ёмкости и количеству. Незащищённые батареи россыпью не допускаются." }],
      hint: "Несколько одинаковых аккумуляторов, лежащих без упаковки."
    },
    {
      id: "replica1",
      title: "Ручная кладь · муляж оружия",
      task: "Найдите запрещённый предмет",
      svg: bag(
        cloth(110, 180, 58, 34) + book(280, 170, 50, 38, 5) + phone(320, 80) +
        cable(90, 70) +
        replicaGun(180, 90, 1.2)
      ),
      targets: [{ x: 176, y: 86, w: 74, h: 60, name: "Муляж оружия",
        why: "Копии, макеты и игрушечные модели оружия запрещены наравне с настоящим: они вызывают реакцию как на реальную угрозу. Обратите внимание — силуэт оружейный, но цвет не металлический (пластик даёт зелёный/оранжевый оттенок)." }],
      hint: "Форма оружия при неметаллическом цвете — это тоже нарушение."
    },
    {
      id: "shoe1",
      title: "Ручная кладь · маскировка в обуви",
      task: "Найдите запрещённый предмет",
      svg: bag(
        cloth(300, 100, 50, 32) + book(70, 90, 52, 40, 4) + phone(310, 180) +
        shoe(120, 120, 1.15, true) + shoe(120, 175, 1.15, false)
      ),
      targets: [{ x: 134, y: 138, w: 52, h: 16, name: "Пластина в подошве",
        why: "Обувь — классическое место сокрытия: в подошве размещают клинки, пластины и заряды. Признак — инородный плотный слой правильной формы внутри мягкой органической подошвы. Сравните оба ботинка между собой: в одном слой есть, в другом нет." }],
      hint: "Сравните два ботинка — в одном есть лишний плотный слой."
    },
    {
      id: "laptopied1",
      title: "Ручная кладь · вложение в электронику",
      task: "Найдите признаки угрозы",
      svg: bag(
        cloth(90, 190, 56, 32) + book(300, 180, 48, 36, -5) + phone(320, 80) +
        coins(80, 80) +
        laptopIED(160, 100, 1.3)
      ),
      targets: [{ x: 156, y: 96, w: 88, h: 56, name: "Посторонний блок в ноутбуке",
        why: "Ноутбук — распространённый носитель для сокрытия. У исправного устройства внутри узнаваемая структура: плата, батарея, привод. Тревожный признак — однородная органическая масса, дополнительная батарея и провода на месте штатных компонентов. Такое устройство направляется на ручную проверку и включение." }],
      hint: "Внутри ноутбука не та начинка: однородная масса вместо платы, лишняя батарея и провода."
    },
    {
      id: "food1",
      title: "Ручная кладь · плотная органика",
      task: "Найдите запрещённый предмет — или подтвердите, что сумка чистая",
      svg: bag(
        food(150, 100, 1.25) + cloth(300, 170, 52, 34) +
        book(70, 90, 54, 40, 5) + phone(310, 90) + cable(120, 200)
      ),
      targets: [],
      clean: true,
      cleanWhy: "Это продукты питания, а не взрывчатое вещество. Оба объекта органические (оранжевые), но структура разная: у ВВ масса однородная, с ровными краями и без внутренних деталей, а у продуктов видна неоднородность — куски, пустоты, неровные границы. Продукты в ручной клади не запрещены (ограничения касаются жидкостей и ввоза в отдельные страны).",
      hint: "Оранжевый ≠ взрывчатка. Смотрите на структуру: однородная масса или неоднородная?"
    },
    {
      id: "meds1",
      title: "Ручная кладь · медикаменты",
      task: "Найдите запрещённый предмет — или подтвердите, что сумка чистая",
      svg: bag(
        syringes(150, 110, 1.2) + bottle(240, 120, 0.7) +
        cloth(90, 180, 54, 32) + book(300, 80, 48, 36, -4) + phone(80, 80)
      ),
      targets: [],
      clean: true,
      cleanWhy: "Шприцы и лекарственные средства разрешены к перевозке в ручной клади при наличии медицинских показаний; жидкие лекарства не подпадают под ограничение 100 мл при подтверждающих документах. Пассажира не задерживают — при необходимости уточняют назначение и проверяют документы. Здесь важно не создавать ложную тревогу.",
      hint: "Медицинские изделия сами по себе не запрещены — оцените, есть ли реальная угроза."
    }
  ];

  return { scenes: SCENES };
})();
