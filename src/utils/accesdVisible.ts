import type { NormalizedTransaction } from './types';

const MONTHS: Record<string, number> = {
  january: 1, jan: 1, janvier: 1, february: 2, feb: 2, fev: 2, fevrier: 2,
  march: 3, mar: 3, mars: 3, april: 4, apr: 4, avr: 4, avril: 4,
  may: 5, mai: 5, june: 6, jun: 6, juin: 6, july: 7, jul: 7, juil: 7, juillet: 7,
  august: 8, aug: 8, aou: 8, aout: 8, september: 9, sep: 9, sept: 9, septembre: 9,
  october: 10, oct: 10, octobre: 10, november: 11, nov: 11, novembre: 11,
  december: 12, dec: 12, decembre: 12,
};

export class AccesDParseError extends Error {
  constructor(message: string, readonly diagnostic: string) {
    super(message);
    this.name = 'AccesDParseError';
  }
}

function clean(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function maskedPattern(value: string): string {
  return Array.from(clean(value)).slice(0, 48).map(char => {
    if (/\p{L}/u.test(char)) return 'A';
    if (/\p{N}/u.test(char)) return '9';
    return ' .,/\\-+()$€−'.includes(char) ? char : '?';
  }).join('');
}

function rowDiagnostic(reason: string, rowNumber: number, rowCount: number,
  cells: Element[], headingFound: boolean, amountIndex: number): string {
  return [
    'AccèsD parser diagnostic v3',
    `reason=${reason}`,
    `row=${rowNumber}/${rowCount}`,
    `cellCount=${cells.length}`,
    `cellTags=${cells.map(cell => cell.tagName).join(',')}`,
    `monthHeadingFound=${headingFound}`,
    `datePattern=${maskedPattern(cells[0] ? cellText(cells[0]) : '')}`,
    `amountColumn=${amountIndex + 1}`,
    `amountPattern=${maskedPattern(cells[amountIndex] ? cellText(cells[amountIndex]) : '')}`,
  ].join('\n');
}

function fold(value: string): string {
  return clean(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function visible(element: Element): boolean {
  for (let current: Element | null = element; current; current = current.parentElement) {
    if (current.hasAttribute('hidden') || current.getAttribute('aria-hidden') === 'true') return false;
    const style = window.getComputedStyle(current);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
  }
  return true;
}

function cellText(element: Element): string {
  const rendered = element instanceof HTMLElement ? element.innerText : undefined;
  if (typeof rendered === 'string' && rendered.trim()) return clean(rendered);

  const parts: string[] = [];
  const walk = (node: Node): void => {
    if (node.nodeType === Node.TEXT_NODE) {
      if (node.textContent?.trim()) parts.push(node.textContent);
    } else if (node instanceof Element) {
      if (!visible(node)) return;
      node.childNodes.forEach(walk);
    }
  };
  walk(element);
  return clean(parts.join(' '));
}

type SectionInfo =
  | { kind: 'checking' | 'billed'; month: number; year: number }
  | { kind: 'pending'; accountKind: 'checking' | 'billed' | null };
type SectionHeading = SectionInfo & { element: Element };

function sectionHeading(value: string): SectionInfo | null {
  const label = fold(value);
  if (/^autorisees non facturees(?:\s|$)/.test(label)) {
    return { kind: 'pending', accountKind: 'billed' };
  }
  if (/^(?:transactions en attente|operations en attente)(?:\s|$)/.test(label)) {
    return { kind: 'pending', accountKind: 'checking' };
  }
  if (/^pending transactions(?:\s|$)/.test(label) || label === 'en attente' || label === 'pending') {
    return { kind: 'pending', accountKind: null };
  }
  const billed = label.match(/^(?:facturees en|posted in)\s+([a-z]+)\s+(20\d{2})(?:\s|$)/);
  const checking = label.match(/^([a-z]+)\s+(20\d{2})$/);
  const match = billed ?? checking;
  if (!match) return null;
  const month = MONTHS[match[1]];
  return month ? { kind: billed ? 'billed' : 'checking', month, year: Number(match[2]) } : null;
}

function findSectionHeadings(root: ParentNode): SectionHeading[] {
  const headings: SectionHeading[] = [];
  for (const element of root.querySelectorAll('h1,h2,h3,h4,h5,h6,[role="heading"],div,span,p,strong,b,section,header')) {
    const ownText = Array.from(element.childNodes)
      .filter(node => node.nodeType === Node.TEXT_NODE)
      .map(node => node.textContent || '').join(' ');
    const raw = element.textContent?.trim() || '';
    const label = ownText.trim() || (raw.length <= 120 ? cellText(element) : '');
    const parsed = sectionHeading(label);
    if (parsed && visible(element)) headings.push({ element, ...parsed });
  }
  return headings;
}

function closestSectionHeading(row: Element, headings: SectionHeading[]): SectionHeading | null {
  let result: SectionHeading | null = null;
  for (const heading of headings) {
    if (heading.element === row) continue;
    if (heading.element.contains(row) ||
        (heading.element.compareDocumentPosition(row) & Node.DOCUMENT_POSITION_FOLLOWING)) {
      result = heading;
    }
  }
  return result;
}

function normalizeDateLabel(value: string): string {
  return fold(value).replace(/[.,]/g, '').replace(
    /^(?:sun(?:day)?|mon(?:day)?|tue(?:sday)?|wed(?:nesday)?|thu(?:rsday)?|fri(?:day)?|sat(?:urday)?|dimanche|lundi|mardi|mercredi|jeudi|vendredi|samedi)\s+/,
    ''
  );
}

function looksLikeDate(value: string): boolean {
  const normalized = normalizeDateLabel(value);
  const first = normalized.split(' ')[0];
  return Object.prototype.hasOwnProperty.call(MONTHS, first) || /^(today|yesterday|aujourd'hui|hier)$/.test(first) ||
    /^\d{1,4}[\/-]\d{1,2}/.test(normalized) ||
    /^\d{1,2}\s+[a-z]+/.test(normalized);
}

function parseDate(value: string, group: { month: number; year: number }): string | null {
  const normalized = normalizeDateLabel(value);
  const monthFirst = normalized.match(/^([a-z]+)\s+(\d{1,2})(?:\s|$)/);
  const dayFirst = normalized.match(/^(\d{1,2})\s+([a-z]+)(?:\s|$)/);
  const repeatedDayFirst = normalized.match(/^(\d{1,2})\s+([a-z]+)\s+(\d{1,2})\s+([a-z]+)(?:\s|$)/);
  const iso = normalized.match(/^(20\d{2})-(\d{1,2})-(\d{1,2})(?:\s|$)/);
  const numeric = normalized.match(/^(\d{1,2})[\/-](\d{1,2})(?:[\/-](20\d{2}))?(?:\s|$)/);
  let month: number | undefined;
  let day: number | undefined;
  let year = group.year;
  if (repeatedDayFirst) {
    const firstMonth = MONTHS[repeatedDayFirst[2]];
    const secondMonth = MONTHS[repeatedDayFirst[4]];
    if (Number(repeatedDayFirst[1]) !== Number(repeatedDayFirst[3]) ||
        (firstMonth && secondMonth && firstMonth !== secondMonth)) return null;
    month = firstMonth ?? secondMonth;
    day = Number(repeatedDayFirst[1]);
  } else if (monthFirst) {
    month = MONTHS[monthFirst[1]];
    day = Number(monthFirst[2]);
  } else if (dayFirst) {
    month = MONTHS[dayFirst[2]];
    day = Number(dayFirst[1]);
  } else if (iso) {
    year = Number(iso[1]);
    month = Number(iso[2]);
    day = Number(iso[3]);
  } else if (numeric) {
    const first = Number(numeric[1]);
    const second = Number(numeric[2]);
    month = group.month;
    day = first === group.month ? second : second === group.month ? first : undefined;
    if (numeric[3]) year = Number(numeric[3]);
  }
  if (month !== group.month || year !== group.year || day === undefined || day < 1 || day > 31) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function pendingContext(value: string, headings: SectionHeading[], accountKind: 'checking' | 'billed' | null):
  { date: string; kind: 'checking' | 'billed' } | null {
  let resolved: { date: string; kind: 'checking' | 'billed' } | null = null;
  for (const heading of headings) {
    if (heading.kind === 'pending' || (accountKind && heading.kind !== accountKind)) continue;
    const date = parseDate(value, heading);
    if (!date) continue;
    if (resolved && (resolved.date !== date || resolved.kind !== heading.kind)) return null;
    resolved = { date, kind: heading.kind };
  }
  return resolved;
}

function hasPendingDateStatus(value: string): boolean {
  return /(?:^|\s)(?:pending|en attente)(?:\s|$)/.test(normalizeDateLabel(value));
}

export function parseAccesDAmount(value: string): number | null {
  const raw = value.replace(/[\u2212\u2013\u2014]/g, '-').replace(/[\s\u00a0\u202f$€]/g, '');
  const negative = raw.startsWith('-') || /^\(.*\)$/.test(raw);
  const unsigned = raw.replace(/^[+\-\(]/, '').replace(/\)$/, '');
  if (!/^[\d.,]+$/.test(unsigned)) return null;
  const lastComma = unsigned.lastIndexOf(',');
  const lastDot = unsigned.lastIndexOf('.');
  const markIndex = Math.max(lastComma, lastDot);
  const tail = markIndex >= 0 ? unsigned.slice(markIndex + 1) : '';
  const hasCents = markIndex >= 0 && /^\d{1,2}$/.test(tail);
  const integerText = hasCents ? unsigned.slice(0, markIndex) : unsigned;
  if (markIndex >= 0 && !hasCents && tail.length !== 3) return null;
  if (!/^\d+$/.test(integerText) &&
      !(/^\d{1,3}([.,]\d{3})+$/.test(integerText) &&
        !(integerText.includes('.') && integerText.includes(',')))) return null;
  const integer = integerText.replace(/[.,]/g, '');
  const cents = hasCents ? tail : '00';
  const amount = Number(`${integer}.${cents.padEnd(2, '0')}`);
  return Number.isSafeInteger(Math.round(amount * 100)) ? (negative ? -amount : amount) : null;
}

interface Columns {
  date: number;
  description: number;
  amount: number;
  count: number;
}

interface TransactionRow {
  element: Element;
  columns: Columns;
}

function headerColumns(cells: Element[]): Columns | null {
  if (cells.length < 3) return null;
  const labels = cells.map(cell => fold(cellText(cell)));
  const amount = labels.findIndex(label => label === 'amount' || label === 'montant');
  const validAmountColumn = amount === 2 ||
    (amount === 3 && ['remises', 'rewards'].includes(labels[2]));
  return labels[0] === 'date' && labels[1] === 'description' && validAmountColumn
    ? { date: 0, description: 1, amount, count: cells.length } : null;
}

function rowCells(row: Element): Element[] {
  return Array.from(row.children).filter(child => child.tagName !== 'SCRIPT');
}

function findRows(root: ParentNode): TransactionRow[] {
  const semanticHeaders = Array.from(root.querySelectorAll('tr,[role="row"]'))
    .filter(row => headerColumns(rowCells(row)) && visible(row));
  const rows = new Map<Element, Columns>();
  for (const header of semanticHeaders) {
    const columns = headerColumns(rowCells(header));
    if (!columns) continue;
    const table = header.closest('table,[role="table"],[role="grid"]');
    if (table) {
      for (const row of table.querySelectorAll('tr,[role="row"]')) {
        if (row !== header && visible(row) && !headerColumns(rowCells(row))) rows.set(row, columns);
      }
    } else if (header.parentElement) {
      for (const row of header.parentElement.children) {
        if (row !== header && visible(row) && !headerColumns(rowCells(row))) rows.set(row, columns);
      }
    }
  }
  if (rows.size) return Array.from(rows, ([element, columns]) => ({ element, columns }));

  // AccèsD may nest transaction rows in a wrapper beside a div-based header.
  const divHeaders = Array.from(root.querySelectorAll('div'))
    .filter(row => headerColumns(rowCells(row)) && visible(row));
  for (const header of divHeaders) {
    const columns = headerColumns(rowCells(header));
    if (!columns) continue;
    const section = header.parentElement;
    if (!section) continue;
    const candidates = Array.from(section.querySelectorAll('div,li,[role="row"]'))
      .filter(row => row !== header && visible(row) &&
        !!(header.compareDocumentPosition(row) & Node.DOCUMENT_POSITION_FOLLOWING) &&
        rowCells(row).length >= 3 && looksLikeDate(cellText(rowCells(row)[0])));
    // A wrapper can also start with a dated row; keep its innermost transaction rows.
    for (const row of candidates.filter(row => !candidates.some(other => other !== row && row.contains(other)))) {
      rows.set(row, columns);
    }
  }
  return Array.from(rows, ([element, columns]) => ({ element, columns }));
}

function descriptionParts(cell: Element): { description: string; category: string } {
  const text = cellText(cell);
  const parts = Array.from(cell.children).map(child => cellText(child)).filter(Boolean);
  if (parts.length >= 2 && text.startsWith(parts[0]) && parts[1] !== parts[0]) {
    return { category: parts[0], description: parts.slice(1).join(' ') };
  }
  return { description: text, category: '' };
}

export function parseVisibleAccesDTransactions(root: ParentNode = document): NormalizedTransaction[] {
  const rows = findRows(root);
  if (!rows.length) {
    throw new AccesDParseError('Could not find a visible AccèsD transaction table with Date, Description, and Amount columns.',
      'AccèsD parser diagnostic v3\nreason=no-rows\nrowCount=0');
  }
  const transactions: NormalizedTransaction[] = [];
  const headings = findSectionHeadings(root);
  let datedRowCount = 0;
  let pendingRowCount = 0;
  for (const [index, { element: row, columns }] of rows.entries()) {
    const cells = rowCells(row);
    if (cells.length < 3) continue;
    const dateText = cellText(cells[columns.date]);
    if (!looksLikeDate(dateText)) continue;
    datedRowCount++;
    let descriptionIndex = columns.description;
    let amountIndex = columns.amount;
    // Some three-column layouts put a separate blank icon cell before the description.
    if (columns.count === 3 && cells.length === 4 && !cellText(cells[descriptionIndex])) {
      descriptionIndex++;
      amountIndex++;
    }
    const section = closestSectionHeading(row, headings);
    if (!section) {
      throw new AccesDParseError('Could not find the month and year for a visible transaction. No CSV was created.',
        rowDiagnostic('month-heading', index + 1, rows.length, cells, false, amountIndex));
    }
    const isPending = section.kind === 'pending' || hasPendingDateStatus(dateText);
    if (isPending) pendingRowCount++;
    const inferred = section.kind === 'pending'
      ? pendingContext(dateText, headings, section.accountKind) : null;
    if (section.kind === 'pending' && !inferred) {
      throw new AccesDParseError('Could not determine a unique year and account type for a pending transaction. No CSV was created.',
        rowDiagnostic('pending-year', index + 1, rows.length, cells, false, amountIndex));
    }
    const date = section.kind === 'pending' ? inferred?.date : parseDate(dateText, section);
    const accountKind = section.kind === 'pending' ? inferred?.kind : section.kind;
    const amountText = cells[amountIndex] ? cellText(cells[amountIndex]) : '';
    let amount = parseAccesDAmount(amountText);
    if (accountKind === 'billed' && amount !== null && amount > 0 && !/^\+/.test(amountText)) {
      amount = -amount;
    }
    const { description, category } = cells[descriptionIndex]
      ? descriptionParts(cells[descriptionIndex])
      : { description: '', category: '' };
    if (!date || amount === null || !description) {
      const reason = !date ? 'date' : amount === null ? 'amount' : 'description';
      throw new AccesDParseError(`Could not read transaction row ${index + 1}: ${reason}. No CSV was created.`,
        rowDiagnostic(reason, index + 1, rows.length, cells, true, amountIndex));
    }
    const pendingLabel = accountKind === 'billed' ? 'Pending authorization' : 'Pending transaction';
    const memoCategory = isPending
      ? `${pendingLabel}${category ? ` | ${category}` : ''}` : category;
    transactions.push({ id: `accesd-${transactions.length}`, date, description, amount, currency: 'CAD',
      category: memoCategory, accountId: '' });
  }
  if (!transactions.length) throw new AccesDParseError('No billed or dated transactions were found in the current AccèsD view.',
    `AccèsD parser diagnostic v3\nreason=no-dated-rows\nrowCount=${rows.length}\ndatedRowCount=${datedRowCount}\npendingRowCount=${pendingRowCount}\nmonthHeadingCount=${headings.filter(heading => heading.kind !== 'pending').length}\nbilledHeadingCount=${headings.filter(heading => heading.kind === 'billed').length}`);
  return transactions;
}
