/**
 * Test for TruyenDich.AI latest chapter parsing
 * 
 * Bug: checkLatestChapter() returns 2679497 instead of 776
 * Root cause: regex /(\d+)\s*-\s*(\d+)/g matches Next.js chunk filename "255-2679497c14df6d7b.js"
 * 
 * Expected: 776 (from initialData.total or latestChapters[0].chapter_number)
 */

const TRUYENDICH_SAMPLE_HTML = `<!DOCTYPE html><html lang="vi"><head>
<script src="/_next/static/chunks/255-2679497c14df6d7b.js" async=""></script>
</head><body>
<script>self.__next_f.push([1,"25:[\\"$\\",\\"$L2d\\",null,{\\"initialData\\":{\\"total\\":776,\\"page\\":1,\\"size\\":50,\\"items\\":[{\\"id\\":7692320,\\"chapter_number\\":1}]},\\"latestChapters\\":[{\\"id\\":14153763,\\"chapter_number\\":776,\\"title\\":\\"Nhĩ Thì Gian Bất Đa\\"}]}" ])</script>
<div class="bg-card/50 p-4 rounded-xl">
<p class="font-bold text-sm text-foreground">776</p>
</div>
</body></html>`;

// OLD BUGGY IMPLEMENTATION
function checkTruyenDichLatestBuggy(html: string): number {
  let maxChapter = 0;
  const rangeMatches = html.match(/(\d+)\s*-\s*(\d+)/g);
  if (rangeMatches) {
    for (const r of rangeMatches) {
      const match = r.match(/(\d+)\s*-\s*(\d+)/);
      if (match) {
        const endNum = parseInt(match[2]);
        if (endNum > maxChapter) maxChapter = endNum;
      }
    }
  }
  return maxChapter;
}

// NEW FIXED IMPLEMENTATION
function checkTruyenDichLatestFixed(html: string): number {
  const normalized = html.replace(/\\"/g, '"');

  // 1. Try to extract from Next.js initialData.total
  const totalMatch = normalized.match(/"total"\s*:\s*(\d+)/);
  if (totalMatch) {
    const total = parseInt(totalMatch[1]);
    if (total > 0 && total < 100000) return total;
  }
  
  // 2. Try to extract from latestChapters[0].chapter_number
  const latestMatch = normalized.match(/"latestChapters"\s*:\s*\[\s*\{[^}]*"chapter_number"\s*:\s*(\d+)/);
  if (latestMatch) {
    const latest = parseInt(latestMatch[1]);
    if (latest > 0 && latest < 100000) return latest;
  }
  
  // 3. Try to find "Số chương" field in DOM
  const chapterCountMatch = html.match(/Số chương[\s\S]{0,100}?(\d+)</i);
  if (chapterCountMatch) {
    const count = parseInt(chapterCountMatch[1]);
    if (count > 0 && count < 100000) return count;
  }
  
  // 4. Fallback: find /chuong-N links (but only in href context)
  const chapterLinkMatches = html.match(/href="[^"]*\/chuong-(\d+)[^"]*"/g);
  if (chapterLinkMatches) {
    let maxFromLinks = 0;
    for (const m of chapterLinkMatches) {
      const numMatch = m.match(/chuong-(\d+)/);
      if (numMatch) {
        const num = parseInt(numMatch[1]);
        if (num > maxFromLinks) maxFromLinks = num;
      }
    }
    if (maxFromLinks > 0) return maxFromLinks;
  }
  
  return 0;
}

// RUN TESTS
console.log("=== Testing TruyenDich.AI Latest Chapter Parsing ===\n");

console.log("Test 1: Bug reproduction - should NOT return 2679497");
const buggyResult = checkTruyenDichLatestBuggy(TRUYENDICH_SAMPLE_HTML);
console.log(`  Buggy implementation result: ${buggyResult}`);
console.log(`  Expected: 776, Got: ${buggyResult}`);
if (buggyResult === 2679497) {
  console.log("  ✗ BUG REPRODUCED: Got 2679497 from chunk filename\n");
} else {
  console.log("  ✓ Bug not present (unexpected)\n");
}

console.log("Test 2: Fixed implementation - should return 776");
const fixedResult = checkTruyenDichLatestFixed(TRUYENDICH_SAMPLE_HTML);
console.log(`  Fixed implementation result: ${fixedResult}`);
console.log(`  Expected: 776, Got: ${fixedResult}`);
if (fixedResult === 776) {
  console.log("  ✓ PASS: Correctly extracted 776 from initialData.total\n");
} else if (fixedResult === 2679497) {
  console.log("  ✗ FAIL: Still getting chunk filename\n");
} else {
  console.log(`  ✗ FAIL: Got unexpected value ${fixedResult}\n`);
}

console.log("Test 3: Validation - results should be reasonable (< 100000)");
console.log(`  Buggy: ${buggyResult} - ${buggyResult < 100000 ? "✓ reasonable" : "✗ UNREASONABLE"}`);
console.log(`  Fixed: ${fixedResult} - ${fixedResult < 100000 ? "✓ reasonable" : "✗ UNREASONABLE"}`);

console.log("\n=== Summary ===");
console.log(`Bug fixed: ${fixedResult === 776 ? "YES ✓" : "NO ✗"}`);
