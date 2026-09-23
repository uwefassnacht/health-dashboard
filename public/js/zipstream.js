/*
 * Minimal streaming reader for the Apple Health export.zip.
 *
 * Reads only the zip's central directory, finds the main export XML
 * (export.xml, or its localised name such as Exportieren.xml) and returns a
 * ReadableStream of its decompressed bytes. Nothing is loaded into memory as a whole;
 * decompression uses the browser's native DecompressionStream("deflate-raw").
 * Supports ZIP64 (exports larger than 4 GB). A plain .xml file is streamed as is.
 * Works in browsers (Web Worker) and in Node 22+ (Blob from fs.openAsBlob) for testing.
 */
(function (root) {
  "use strict";

  async function bytes(blob, start, end) {
    return new DataView(await blob.slice(start, end).arrayBuffer());
  }
  function u64(dv, off) { return Number(dv.getBigUint64(off, true)); }

  async function readCentralDirectory(blob) {
    var size = blob.size;
    var tailLen = Math.min(size, 65535 + 22 + 20);
    var tailStart = size - tailLen;
    var tail = await bytes(blob, tailStart, size);
    var eocd = -1;
    for (var i = tailLen - 22; i >= 0; i--) {
      if (tail.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error("This doesn't look like a zip file (no end-of-central-directory record).");
    var count = tail.getUint16(eocd + 10, true);
    var cdSize = tail.getUint32(eocd + 12, true);
    var cdOffset = tail.getUint32(eocd + 16, true);

    if (count === 0xffff || cdSize === 0xffffffff || cdOffset === 0xffffffff) {
      // ZIP64: the locator sits right before the classic EOCD record
      var loc = eocd - 20;
      if (loc < 0 || tail.getUint32(loc, true) !== 0x07064b50) throw new Error("ZIP64 locator not found.");
      var z64Offset = u64(tail, loc + 8);
      var z64 = await bytes(blob, z64Offset, z64Offset + 56);
      if (z64.getUint32(0, true) !== 0x06064b50) throw new Error("ZIP64 end-of-central-directory record not found.");
      count = u64(z64, 32);
      cdSize = u64(z64, 40);
      cdOffset = u64(z64, 48);
    }

    var cd = await bytes(blob, cdOffset, cdOffset + cdSize);
    var entries = [], p = 0, dec = new TextDecoder();
    for (var n = 0; n < count && p + 46 <= cd.byteLength; n++) {
      if (cd.getUint32(p, true) !== 0x02014b50) break;
      var flags = cd.getUint16(p + 8, true);
      var method = cd.getUint16(p + 10, true);
      var compSize = cd.getUint32(p + 20, true);
      var uncompSize = cd.getUint32(p + 24, true);
      var nameLen = cd.getUint16(p + 28, true);
      var extraLen = cd.getUint16(p + 30, true);
      var commentLen = cd.getUint16(p + 32, true);
      var localOffset = cd.getUint32(p + 42, true);
      var name = dec.decode(new Uint8Array(cd.buffer, cd.byteOffset + p + 46, nameLen));
      // ZIP64 extended information extra field (0x0001)
      var e = p + 46 + nameLen, eEnd = e + extraLen;
      while (e + 4 <= eEnd) {
        var id = cd.getUint16(e, true), len = cd.getUint16(e + 2, true), q = e + 4;
        if (id === 0x0001) {
          if (uncompSize === 0xffffffff) { uncompSize = u64(cd, q); q += 8; }
          if (compSize === 0xffffffff) { compSize = u64(cd, q); q += 8; }
          if (localOffset === 0xffffffff) { localOffset = u64(cd, q); q += 8; }
        }
        e += 4 + len;
      }
      entries.push({ name: name, method: method, flags: flags, compSize: compSize, uncompSize: uncompSize, localOffset: localOffset });
      p += 46 + nameLen + extraLen + commentLen;
    }
    return entries;
  }

  function pickExportEntry(entries) {
    // The main export is the largest XML file directly in the export folder that is not the CDA file.
    var xml = entries.filter(function (en) {
      var lower = en.name.toLowerCase();
      var depth = en.name.split("/").filter(Boolean).length;
      return lower.endsWith(".xml") && lower.indexOf("cda") < 0 && depth <= 2 && !lower.startsWith("__macosx");
    });
    xml.sort(function (a, b) { return b.uncompSize - a.uncompSize; });
    return xml[0] || null;
  }

  function countingStream(onBytes) {
    var total = 0;
    return new TransformStream({
      transform: function (chunk, controller) { total += chunk.byteLength; onBytes(total); controller.enqueue(chunk); }
    });
  }

  /**
   * Open an export (zip or xml). Returns { name, compressedSize, uncompressedSize, stream(onProgress) }.
   * onProgress(fraction) reports progress through the export XML (0..1).
   */
  async function openExport(blob, fileName) {
    var head = new Uint8Array(await blob.slice(0, 4).arrayBuffer());
    var isZip = head[0] === 0x50 && head[1] === 0x4b;
    if (!isZip) {
      return {
        name: fileName || "export.xml", compressedSize: blob.size, uncompressedSize: blob.size,
        stream: function (onProgress) {
          var s = blob.stream();
          return onProgress ? s.pipeThrough(countingStream(function (n) { onProgress(n / blob.size); })) : s;
        }
      };
    }
    var entries = await readCentralDirectory(blob);
    var entry = pickExportEntry(entries);
    if (!entry) throw new Error("No Apple Health export XML found in this zip. Please drop the export.zip from the Health app.");
    if (entry.flags & 1) throw new Error("The zip is encrypted.");
    if (entry.method !== 0 && entry.method !== 8) throw new Error("Unsupported compression method " + entry.method + ".");
    var lh = await bytes(blob, entry.localOffset, entry.localOffset + 30);
    if (lh.getUint32(0, true) !== 0x04034b50) throw new Error("Corrupt zip (local header not found).");
    var dataStart = entry.localOffset + 30 + lh.getUint16(26, true) + lh.getUint16(28, true);
    return {
      name: entry.name, compressedSize: entry.compSize, uncompressedSize: entry.uncompSize,
      stream: function (onProgress) {
        var s = blob.slice(dataStart, dataStart + entry.compSize).stream();
        if (entry.method === 8) s = s.pipeThrough(new DecompressionStream("deflate-raw"));
        // progress is measured on the decompressed bytes (the compressed side is read ahead in big buffers)
        if (onProgress) s = s.pipeThrough(countingStream(function (n) { onProgress(Math.min(1, n / (entry.uncompSize || 1))); }));
        return s;
      }
    };
  }

  var api = { openExport: openExport, readCentralDirectory: readCentralDirectory, pickExportEntry: pickExportEntry };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.HealthZip = api;
})(typeof self !== "undefined" ? self : this);
