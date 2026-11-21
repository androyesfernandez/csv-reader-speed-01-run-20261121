// csv-reader-speed-01: a fast drop-in for csv-reader 1.0.0.
//
// run(input) returns, for a case's input {text, header}, exactly the answer
// csv-reader 1.0.0 returns: {columns, rows, errors}. The reading follows
// csv-reader's broken-row policy to the letter:
//
//   - a U+FEFF at the very start of the text is dropped;
//   - a record ends at LF or CRLF, and a line left with no characters is no
//     record (a line holding only stray CRs is no record either, but its
//     stray_cr errors stay);
//   - outside quotes a CR not followed by LF is dropped (error stray_cr);
//   - a field that opens with a quote runs to the next quote that is not
//     doubled: "" inside it is one quote, and each CRLF or lone CR inside it
//     is read as LF; what follows the closing quote, up to the next comma or
//     line break, is appended as it stands (error quote_junk, when anything
//     was appended); a quote that never closes is a literal character and the
//     text after it is read again as unquoted (error unterminated_quote);
//   - a quote inside an unquoted field is a literal character; fields stay
//     strings, never trimmed or converted;
//   - columns is the first record when header is true, else null; rows holds
//     the records after it (every record when header is false), each padded
//     with "" (error short_row, with fields: its field count) or cut (error
//     long_row, with extra: the cut fields) to the first record's width;
//   - each error is {code, line, row} in the order met: line the 1-based line
//     its record starts on, counting every LF, CRLF and lone CR inside
//     quotes, and row its record's index in rows, null for the header.
//
// csv-reader builds every field a character at a time. This reader returns
// the same answers by scanning with indexOf jumps and slicing fields out of
// the text whole: a field with no CR in it is one slice; the position of the
// next CR is cached and only ever moves forward, so CR checks cost nothing
// amortised; the LF ending the line being read is cached across a record's
// unquoted fields, so they scan for commas alone; quoted segments without a
// CR are one slice each, and only the rare segment holding a CR is rebuilt
// piece by piece. Pure: no clock, no randomness, nothing kept from one call
// to the next.

/** How a field ended: at a comma, at a line break, or at the end of the text. */
const COMMA_END = 0;
const BREAK_END = 1;
const TEXT_END = 2;

/** csv-reader 1.0.0's answer for one case's input, computed faster. */
export function run(input) {
  const raw = input.text;
  const text = typeof raw === 'string' ? raw : String(raw);
  const header = input.header === true;
  const n = text.length;

  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;

  let pos = 0; // the next character to read
  let line = 1; // the line that character is on
  if (text.charCodeAt(0) === 0xfeff) pos = 1;

  // The record being read: the line it starts on and the index in rows it
  // takes (null: the header). Every error of the record carries these two.
  let recordLine = 1;
  let recordRow = null;

  // The next CR at or after crBase, cached: crIdx is that CR's index, or -1
  // when no CR follows crBase. pos only moves forward (the one backward step,
  // an unterminated quote's re-read, starts before crBase and so recomputes),
  // which keeps the whole text's CR scans to one pass in total.
  let crBase = 0;
  let crIdx = -2; // -2: nothing computed yet
  function nextCR(p) {
    if (crIdx === -2 || p < crBase || (crIdx !== -1 && crIdx < p)) {
      crIdx = text.indexOf('\r', p);
      crBase = p;
    }
    return crIdx;
  }

  // The LF that ends the physical line being read, cached across the
  // unquoted fields of a record: lineEnd is that LF's index (n when the line
  // runs to the end of the text), or -1 when it is not known — before the
  // first field of a line, and after a quoted field, which may have crossed
  // lines. While it is known and pos has not passed it, it is the first LF
  // at or after pos, so an unquoted field needs no LF scan of its own.
  let lineEnd = -1;
  function lineEndFrom(p) {
    if (lineEnd < p) {
      lineEnd = text.indexOf('\n', p);
      if (lineEnd === -1) lineEnd = n;
    }
    return lineEnd;
  }

  // The number of LFs in text[a, b).
  function countLF(a, b) {
    let count = 0;
    let i = text.indexOf('\n', a);
    while (i !== -1 && i < b) {
      count++;
      i = text.indexOf('\n', i + 1);
    }
    return count;
  }

  // readUnquoted's results, kept in scratch variables so the common field
  // costs no result object.
  let uValue = '';
  let uEnded = TEXT_END;
  let uAdded = 0;

  // Reads unquoted characters from pos onto `seed`, as csv-reader's
  // readUnquoted does: the field ends at a comma, at LF or CRLF, or at the
  // end of the text; a CR not followed by LF is dropped (stray_cr) and the
  // field goes on. Sets uValue, uEnded and uAdded (the characters appended
  // past the seed).
  function readUnquoted(seed) {
    let parts = null; // the field in pieces, once a stray CR splits it
    let seg = pos; // the start of the piece being scanned
    let added = 0;
    for (;;) {
      let ic = text.indexOf(',', pos);
      if (ic === -1) ic = n;
      const il = lineEndFrom(pos);
      let end;
      let ended;
      if (ic <= il) {
        end = ic;
        ended = ic === n ? TEXT_END : COMMA_END;
      } else {
        end = il;
        ended = BREAK_END;
      }
      const ir = nextCR(pos);
      if (ir !== -1 && ir < end) {
        if (text.charCodeAt(ir + 1) === 10) {
          // CRLF ends the field.
          added += ir - seg;
          const tail = text.slice(seg, ir);
          uValue = parts === null ? seed + tail : (parts.push(tail), parts.join(''));
          uEnded = BREAK_END;
          uAdded = added;
          pos = ir + 2;
          line++;
          return;
        }
        // A lone CR is dropped (stray_cr); the field goes on without it.
        errors.push({ code: 'stray_cr', line: recordLine, row: recordRow });
        added += ir - seg;
        if (parts === null) parts = [seed, text.slice(seg, ir)];
        else parts.push(text.slice(seg, ir));
        pos = ir + 1;
        seg = pos;
        continue;
      }
      added += end - seg;
      const tail = text.slice(seg, end);
      uValue = parts === null ? seed + tail : (parts.push(tail), parts.join(''));
      uEnded = ended;
      uAdded = added;
      if (ended === COMMA_END) pos = end + 1;
      else if (ended === BREAK_END) {
        pos = end + 1;
        line++;
      } else pos = n;
      return;
    }
  }

  // readQuoted's results, in scratch variables like readUnquoted's.
  let qValue = '';
  let qEnded = TEXT_END;

  // One raw segment of a quoted field, text[seg, q): its text with each CRLF
  // or lone CR read as LF, advancing line past every line break in it. A
  // segment with no CR is one slice; one with a CR is rebuilt piece by piece.
  function quotedSegment(seg, q) {
    const ir = nextCR(seg);
    if (ir === -1 || ir >= q) {
      line += countLF(seg, q);
      return text.slice(seg, q);
    }
    const parts = [];
    let p = seg;
    for (;;) {
      const r = nextCR(p);
      if (r === -1 || r >= q) {
        line += countLF(p, q);
        parts.push(text.slice(p, q));
        return parts.join('');
      }
      line += countLF(p, r) + 1;
      parts.push(text.slice(p, r), '\n');
      p = r + 1;
      if (text.charCodeAt(p) === 10) p++; // the LF of a CRLF is read with its CR
    }
  }

  // Reads a quoted field whose opening quote is at pos. Sets qValue/qEnded.
  function readQuoted() {
    const open = pos;
    const openLine = line;
    pos += 1;
    let seg = pos; // the start of the raw segment being scanned
    let acc = null; // the value of the segments before this one, if any
    for (;;) {
      const q = text.indexOf('"', pos);
      if (q === -1) {
        // The quote never closes: it is a literal character, and the text
        // after it is read again as unquoted.
        pos = open + 1;
        line = openLine;
        errors.push({ code: 'unterminated_quote', line: recordLine, row: recordRow });
        readUnquoted('"');
        qValue = uValue;
        qEnded = uEnded;
        return;
      }
      const segVal = quotedSegment(seg, q);
      if (text.charCodeAt(q + 1) === 34) {
        // A doubled quote: one quote in the value, and the field goes on.
        acc = (acc === null ? segVal : acc + segVal) + '"';
        pos = q + 2;
        seg = pos;
        continue;
      }
      const value = acc === null ? segVal : acc + segVal;
      pos = q + 1;
      if (pos >= n) {
        qValue = value;
        qEnded = TEXT_END;
        return;
      }
      const c = text.charCodeAt(pos);
      if (c === 44) {
        pos += 1;
        qValue = value;
        qEnded = COMMA_END;
        return;
      }
      if (c === 10) {
        pos += 1;
        line++;
        qValue = value;
        qEnded = BREAK_END;
        return;
      }
      if (c === 13 && text.charCodeAt(pos + 1) === 10) {
        pos += 2;
        line++;
        qValue = value;
        qEnded = BREAK_END;
        return;
      }
      // What follows the closing quote is appended as it stands, up to the
      // next comma or line break (quote_junk, when anything was appended).
      readUnquoted(value);
      if (uAdded > 0) errors.push({ code: 'quote_junk', line: recordLine, row: recordRow });
      qValue = uValue;
      qEnded = uEnded;
      return;
    }
  }

  for (;;) {
    // Lines with no characters are no records.
    while (pos < n) {
      const c = text.charCodeAt(pos);
      if (c === 10) {
        pos += 1;
        line++;
      } else if (c === 13 && text.charCodeAt(pos + 1) === 10) {
        pos += 2;
        line++;
      } else break;
    }
    if (pos >= n) break;

    recordLine = line;
    recordRow = header && columns === null ? null : rows.length;
    const fields = [];
    let quoted = false;
    let ended;
    do {
      quoted = text.charCodeAt(pos) === 34;
      if (quoted) {
        readQuoted();
        fields.push(qValue);
        ended = qEnded;
      } else {
        readUnquoted('');
        fields.push(uValue);
        ended = uEnded;
      }
    } while (ended === COMMA_END);

    // A line that held only stray CRs is left with no characters: no record
    // (its stray_cr errors stay).
    if (fields.length === 1 && fields[0] === '' && !quoted) continue;

    if (width < 0) width = fields.length;
    if (header && columns === null) {
      columns = fields;
      continue;
    }
    if (fields.length < width) {
      errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: fields.length });
      while (fields.length < width) fields.push('');
    } else if (fields.length > width) {
      errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.splice(width) });
    }
    rows.push(fields);
  }
  return { columns: header ? (columns === null ? [] : columns) : null, rows, errors };
}
