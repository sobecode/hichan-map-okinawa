/*
 * 食べログの営業時間表(曜日ごとの行を平たくした文字列)を、当サイトの h の書式に縮める。
 *   「月・木・金・土・日 10:00 - 17:00 火・水 定休日 営業時間・定休日は…」
 *     → 「10:00〜17:00（火・水定休）」
 * 曜日で時間が違う店は「月〜金 11:00〜15:00 / 土・日 11:00〜21:00」のように並べる。
 * 注記(■以降・「営業時間・定休日は変更…」)と L.O. は落とす。読めなければ '' を返す。
 */
'use strict';
const DAY = '(?:[月火水木金土日祝]|祝前日|祝後日|祝日)';
const DAYS_RE = new RegExp(`^${DAY}(?:・${DAY})*$`);
const TIME_RE = /^\d{1,2}:\d{2}$/;

function compactHours(raw) {
  if (!raw) return '';
  let t = raw.replace(/営業時間・定休日は変更[\s\S]*$/, '')
             .replace(/■[\s\S]*$/, '').replace(/※[\s\S]*$/, '')
             .replace(/\(?L\.?O\.?[^\d]*\d{1,2}:\d{2}\)?/gi, ' ')
             .replace(/ドリンク\s*/g, ' ').replace(/料理\s*/g, ' ')
             .replace(/翌/g, '').replace(/\s+/g, ' ').trim();
  const tok = t.split(' ');
  const groups = [];            // {days, times:[...], closed}
  let cur = null;
  for (let i = 0; i < tok.length; i++) {
    const w = tok[i];
    if (DAYS_RE.test(w)) { cur = {days: w, times: [], closed: false}; groups.push(cur); continue; }
    if (!cur) { cur = {days: '', times: [], closed: false}; groups.push(cur); }
    if (w === '定休日') cur.closed = true;
    else if (TIME_RE.test(w) && tok[i + 1] === '-' && TIME_RE.test(tok[i + 2] || '')) {
      cur.times.push(`${w}〜${tok[i + 2]}`); i += 2;
    } else if (TIME_RE.test(w) && tok[i + 1] === '-') { cur.times.push(`${w}〜`); i += 1; }
  }
  const open = groups.filter(g => g.times.length);
  if (!open.length) return '';
  const shortDays = d => d.split('・').filter(x => x !== '祝前日' && x !== '祝後日').join('・');
  const closedDays = groups.filter(g => g.closed && !g.times.length).map(g => shortDays(g.days)).filter(Boolean).join('・');
  const off = closedDays ? `（${closedDays}${closedDays.includes('・') ? '' : '曜'}定休）` : '';
  const sig = g => g.times.join('・');
  // 曜日の一番多い時間帯を本体にし、違う曜日は「金は17:30〜23:00」と添える
  const weight = g => g.days ? g.days.split('・').length : 99;
  const main = open.slice().sort((x, y) => weight(y) - weight(x))[0];
  const extra = open.filter(g => g !== main && sig(g) !== sig(main))
    .map(g => `${shortDays(g.days)}は${sig(g)}`);
  // 既存の h に合わせて時の先頭の0を落とす(06:30→6:30、00:00→0:00)
  const out = (sig(main) + (extra.length ? `（${extra.join('、')}）` : '') + off)
    .replace(/(^|[^\d])0(\d):/g, '$1$2:');
  return out.length > 90 ? '' : out;   // 長すぎる表は要約を諦める(ポップアップが崩れる)
}
module.exports = {compactHours};

if (require.main === module) {
  const db = require('./tabelog_status.json');
  for (const [k, v] of Object.entries(db)) if (v.hours) console.log(k.split('|')[0], '→', compactHours(v.hours) || '(空)', '   ←', v.hours.slice(0, 80));
}
