#!/usr/bin/env python3
"""
Spec Sync — splits DEV_SPEC.md into chapter files under auto-coder/references/.

Usage:
    python scripts/sync_spec.py [--force]
"""

import hashlib
import re
import sys
from pathlib import Path
from typing import List, Tuple, NamedTuple


class Chapter(NamedTuple):
    number: int
    cn_title: str
    filename: str
    start_line: int
    end_line: int
    line_count: int


# Chapter number -> English slug (encoding-independent)
A_SLUG_MAP = {
    1: "overview",
    2: "data-structure",
    3: "offline-pipeline",
    4: "coverage-algorithm",
    5: "sft-grpo",
    6: "deployment",
    7: "evaluation",
}

B_SLUG_MAP = {
    1: "overview",
    2: "features",
    3: "architecture",
    4: "testing",
    5: "schedule",
    6: "future",
}


def _slug(spec_type: str, chapter_num: int, title: str) -> str:
    slug_map = A_SLUG_MAP if spec_type == 'a' else B_SLUG_MAP
    if chapter_num in slug_map:
        return slug_map[chapter_num]
    # Fallback: sanitize whatever title text we have
    clean = re.sub(r'[^\w]+', '-', title, flags=re.ASCII).strip('-').lower()
    return clean or f"chapter-{chapter_num}"


def detect_chapters(content: str, spec_type: str) -> List[Chapter]:
    lines = content.split('\n')
    starts: List[Tuple[int, str, int]] = []
    for i, line in enumerate(lines):
        m = re.match(r'^## (\d+)\.\s+(.+)$', line)
        if m:
            starts.append((int(m.group(1)), m.group(2).strip(), i))
    if not starts:
        return []
    
    chapters = []
    for idx, (num, title, start) in enumerate(starts):
        end = starts[idx + 1][2] if idx + 1 < len(starts) else len(lines)
        chapters.append(Chapter(num, title, f"{spec_type}-{num:02d}-{_slug(spec_type, num, title)}.md", start, end, end - start))
    return chapters


def sync(force: bool = False):
    skill_dir = Path(__file__).parent.parent          # auto-coder/
    repo_root = skill_dir.parent.parent.parent        # .claude/skills/ -> .claude/ -> project root
    
    spec_a = repo_root / "SPEC-A-PROFILE.md"
    spec_b = repo_root / "SPEC-B-AGENT.md"

    # Falls back to PROJECT_SPEC.md for backward compatibility
    if not spec_b.exists():
        spec_b = repo_root / "PROJECT_SPEC.md"

    specs_dir = skill_dir / "references"
    hash_file = skill_dir / ".spec_hash"

    if not spec_a.exists() and not spec_b.exists():
        print(f"ERROR: no spec files found")
        sys.exit(1)

    combined_hash_input = b""
    if spec_a.exists():
        combined_hash_input += spec_a.read_bytes()
    if spec_b.exists():
        combined_hash_input += spec_b.read_bytes()

    # Hash check
    current_hash = hashlib.sha256(combined_hash_input).hexdigest()
    if not force and hash_file.exists() and hash_file.read_text().strip() == current_hash:
        print("specs up-to-date")
        return

    all_chapters = []
    
    if spec_a.exists():
        content_a = spec_a.read_text(encoding='utf-8')
        ch_a = detect_chapters(content_a, 'a')
        lines_a = content_a.split('\n')
        all_chapters.extend((ch, lines_a) for ch in ch_a)
        
    if spec_b.exists():
        content_b = spec_b.read_text(encoding='utf-8')
        ch_b = detect_chapters(content_b, 'b')
        lines_b = content_b.split('\n')
        all_chapters.extend((ch, lines_b) for ch in ch_b)

    specs_dir.mkdir(parents=True, exist_ok=True)

    # Clean orphans
    old = {f.name for f in specs_dir.glob("*.md")}
    new = {ch.filename for ch, _ in all_chapters}
    for f in old - new:
        (specs_dir / f).unlink()

    # Write chapters
    for ch, lines in all_chapters:
        (specs_dir / ch.filename).write_text('\n'.join(lines[ch.start_line:ch.end_line]), encoding='utf-8')

    hash_file.write_text(current_hash)
    print(f"synced {len(all_chapters)} chapters")


if __name__ == "__main__":
    sync(force="--force" in sys.argv)
