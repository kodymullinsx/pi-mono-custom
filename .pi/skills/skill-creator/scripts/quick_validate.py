#!/usr/bin/env python3
"""
Quick validation script for skills.

This validator intentionally keeps hard failures limited to structural issues that
make a skill unusable. It also reports warnings for production hygiene issues
that should be cleaned before packaging or sharing.
"""

import json
import re
import subprocess
import sys
from pathlib import Path

try:
    import yaml  # type: ignore
except ModuleNotFoundError:
    yaml = None

ALLOWED_PROPERTIES = {'name', 'description', 'license', 'allowed-tools', 'metadata', 'compatibility'}
NOISE_NAMES = {'.DS_Store', '__MACOSX', '__pycache__'}
REFERENCE_LINK_RE = re.compile(r'(?<![\w.-])(references/[A-Za-z0-9_./-]+\.(?:md|yaml|yml|json))')


def _ruby_parse_yaml(text):
    """Parse YAML using Ruby's stdlib Psych when PyYAML is unavailable."""
    proc = subprocess.run(
        [
            "ruby",
            "-ryaml",
            "-rjson",
            "-e",
            (
                "begin; "
                "data = YAML.safe_load(STDIN.read, permitted_classes: [], aliases: false); "
                "puts JSON.generate(data); "
                "rescue => e; "
                "warn e.message; "
                "exit 1; "
                "end"
            ),
        ],
        input=text,
        text=True,
        capture_output=True,
    )
    if proc.returncode != 0:
        message = (proc.stderr or proc.stdout).strip() or "Ruby YAML parser failed"
        raise ValueError(message)
    return json.loads(proc.stdout)


def parse_frontmatter_yaml(frontmatter_text):
    """Parse YAML frontmatter with PyYAML when available, else Ruby stdlib."""
    if yaml is not None:
        return yaml.safe_load(frontmatter_text)
    return _ruby_parse_yaml(frontmatter_text)


def parse_yaml_file(path):
    text = path.read_text()
    if yaml is not None:
        return yaml.safe_load(text)
    return _ruby_parse_yaml(text)


def _relative(path, root):
    return str(path.relative_to(root))


def _validate_frontmatter(skill_path, errors):
    skill_md = skill_path / 'SKILL.md'
    if not skill_md.exists():
        errors.append("SKILL.md not found")
        return "", {}

    content = skill_md.read_text()
    if not content.startswith('---'):
        errors.append("No YAML frontmatter found")
        return content, {}

    match = re.match(r'^---\n(.*?)\n---', content, re.DOTALL)
    if not match:
        errors.append("Invalid frontmatter format")
        return content, {}

    frontmatter_text = match.group(1)
    try:
        frontmatter = parse_frontmatter_yaml(frontmatter_text)
        if not isinstance(frontmatter, dict):
            errors.append("Frontmatter must be a YAML dictionary")
            return content, {}
    except Exception as e:
        errors.append(f"Invalid YAML in frontmatter: {e}")
        return content, {}

    unexpected_keys = set(frontmatter.keys()) - ALLOWED_PROPERTIES
    if unexpected_keys:
        errors.append(
            f"Unexpected key(s) in SKILL.md frontmatter: {', '.join(sorted(unexpected_keys))}. "
            f"Allowed properties are: {', '.join(sorted(ALLOWED_PROPERTIES))}"
        )

    if 'name' not in frontmatter:
        errors.append("Missing 'name' in frontmatter")
    if 'description' not in frontmatter:
        errors.append("Missing 'description' in frontmatter")

    name = frontmatter.get('name', '')
    if not isinstance(name, str):
        errors.append(f"Name must be a string, got {type(name).__name__}")
    else:
        name = name.strip()
        if name:
            if not re.match(r'^[a-z0-9-]+$', name):
                errors.append(f"Name '{name}' should be kebab-case (lowercase letters, digits, and hyphens only)")
            if name.startswith('-') or name.endswith('-') or '--' in name:
                errors.append(f"Name '{name}' cannot start/end with hyphen or contain consecutive hyphens")
            if len(name) > 64:
                errors.append(f"Name is too long ({len(name)} characters). Maximum is 64 characters.")

    description = frontmatter.get('description', '')
    if not isinstance(description, str):
        errors.append(f"Description must be a string, got {type(description).__name__}")
    else:
        description = description.strip()
        if '<' in description or '>' in description:
            errors.append("Description cannot contain angle brackets (< or >)")
        if len(description) > 1024:
            errors.append(f"Description is too long ({len(description)} characters). Maximum is 1024 characters.")

    compatibility = frontmatter.get('compatibility', '')
    if compatibility:
        if not isinstance(compatibility, str):
            errors.append(f"Compatibility must be a string, got {type(compatibility).__name__}")
        elif len(compatibility) > 500:
            errors.append(f"Compatibility is too long ({len(compatibility)} characters). Maximum is 500 characters.")

    return content, frontmatter


def _validate_reference_links(skill_path, skill_md_text, errors, warnings):
    for ref in sorted(set(REFERENCE_LINK_RE.findall(skill_md_text))):
        if not (skill_path / ref).exists():
            warnings.append(f"Referenced file not found: {ref}")

    references_dir = skill_path / 'references'
    if not references_dir.exists():
        return

    index_path = None
    for candidate in ('index.yaml', 'index.yml', 'index.md'):
        path = references_dir / candidate
        if path.exists():
            index_path = path
            break

    reference_files = sorted(
        p for p in references_dir.iterdir()
        if p.is_file() and p.suffix.lower() in {'.md', '.yaml', '.yml', '.json'} and not p.name.startswith('.')
    )

    if reference_files and index_path is None:
        warnings.append("references/ exists but has no index.yaml, index.yml, or index.md")
        return

    if index_path and index_path.suffix.lower() in {'.yaml', '.yml'}:
        try:
            index_data = parse_yaml_file(index_path)
            listed = set()
            if isinstance(index_data, dict):
                refs = index_data.get('references', [])
                if isinstance(refs, list):
                    for item in refs:
                        if isinstance(item, dict) and isinstance(item.get('path'), str):
                            listed.add(item['path'])
                        elif isinstance(item, str):
                            listed.add(item)
            for rel in sorted(listed):
                if not (references_dir / rel).exists():
                    errors.append(f"Reference index points to missing file: references/{rel}")
            for path in reference_files:
                if path.name.startswith('index.'):
                    continue
                if path.name not in listed:
                    warnings.append(f"Reference file not listed in index: references/{path.name}")
        except Exception as e:
            errors.append(f"Invalid reference index {index_path.name}: {e}")

    for path in reference_files:
        if path.suffix.lower() != '.md':
            continue
        content = path.read_text()
        line_count = len(content.splitlines())
        if line_count > 300 and '## ' not in content:
            warnings.append(f"Long reference lacks markdown section headings: references/{path.name}")


def _validate_eval_files(skill_path, errors, warnings):
    evals_path = skill_path / 'evals' / 'evals.json'
    if not evals_path.exists():
        return
    try:
        data = json.loads(evals_path.read_text())
    except json.JSONDecodeError as e:
        errors.append(f"Invalid JSON in evals/evals.json: {e}")
        return

    if not isinstance(data, dict):
        errors.append("evals/evals.json must be a JSON object")
        return
    if 'assertions' in data:
        errors.append("evals/evals.json uses obsolete field 'assertions'; use 'expectations'")
    evals = data.get('evals')
    if not isinstance(evals, list):
        errors.append("evals/evals.json missing evals[] array")
        return

    seen_ids = set()
    for idx, item in enumerate(evals):
        if not isinstance(item, dict):
            errors.append(f"evals[{idx}] must be an object")
            continue
        if 'assertions' in item:
            errors.append(f"evals[{idx}] uses obsolete field 'assertions'; use 'expectations'")
        eval_id = item.get('id')
        if eval_id in seen_ids:
            errors.append(f"Duplicate eval id in evals/evals.json: {eval_id}")
        seen_ids.add(eval_id)
        for field in ('id', 'prompt', 'expected_output'):
            if field not in item:
                errors.append(f"evals[{idx}] missing required field '{field}'")
        expectations = item.get('expectations')
        if expectations is not None and not isinstance(expectations, list):
            errors.append(f"evals[{idx}].expectations must be a list when present")


def _validate_hygiene(skill_path, skill_md_text, warnings):
    line_count = len(skill_md_text.splitlines())
    if line_count > 500:
        warnings.append(f"SKILL.md has {line_count} lines; recommended target is under 500")

    for path in skill_path.rglob('*'):
        if path.name in NOISE_NAMES or path.suffix == '.pyc':
            warnings.append(f"Generated/package-noise file present: {_relative(path, skill_path)}")

    if 'with_skill/outputs/' in skill_md_text or 'without_skill/outputs/' in skill_md_text or 'old_skill/outputs/' in skill_md_text:
        warnings.append("SKILL.md may contain legacy eval output paths without run-* directories")
    if '"assertions"' in skill_md_text:
        warnings.append("SKILL.md contains obsolete JSON field name 'assertions'")


def validate_skill(skill_path):
    """Validate a skill directory. Returns (valid, message)."""
    skill_path = Path(skill_path)
    errors = []
    warnings = []

    skill_md_text, _frontmatter = _validate_frontmatter(skill_path, errors)
    if skill_md_text:
        _validate_reference_links(skill_path, skill_md_text, errors, warnings)
        _validate_hygiene(skill_path, skill_md_text, warnings)
    _validate_eval_files(skill_path, errors, warnings)

    if errors:
        message = "Skill is invalid:\n" + "\n".join(f"- {e}" for e in errors)
        if warnings:
            message += "\nWarnings:\n" + "\n".join(f"- {w}" for w in warnings)
        return False, message

    if warnings:
        return True, "Skill is valid!\nWarnings:\n" + "\n".join(f"- {w}" for w in warnings)

    return True, "Skill is valid!"


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python quick_validate.py <skill_directory>")
        sys.exit(1)

    valid, message = validate_skill(sys.argv[1])
    print(message)
    sys.exit(0 if valid else 1)
