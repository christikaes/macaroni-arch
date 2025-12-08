#!/usr/bin/env python3
"""
Python import analyzer - counts individual imports in Python files.
Usage: python_analyzer.py <file_path>
Output: JSON with import counts
"""

import ast
import sys
import json
from pathlib import Path
from typing import Dict


def count_imports(file_path: str) -> Dict[str, int]:
    """
    Count the number of imports from each module.
    
    Examples:
    - from foo import a, b, c -> {'foo': 3}
    - import bar -> {'bar': 1}
    - from .relative import x -> {'.relative': 1}
    """
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            source = f.read()
        
        tree = ast.parse(source, filename=file_path)
        import_counts: Dict[str, int] = {}
        
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                # import foo, bar as baz
                for alias in node.names:
                    module = alias.name
                    import_counts[module] = import_counts.get(module, 0) + 1
            
            elif isinstance(node, ast.ImportFrom):
                # from foo import bar, baz
                module = node.module or ''
                
                # Handle relative imports (from . import x, from .. import y)
                if node.level > 0:
                    module = '.' * node.level + module
                
                # Count each imported name
                count = len(node.names)
                
                # Special case: from foo import * counts as 1
                if count == 1 and node.names[0].name == '*':
                    count = 1
                
                import_counts[module] = import_counts.get(module, 0) + count
        
        return import_counts
    
    except Exception as e:
        print(json.dumps({"error": str(e)}), file=sys.stderr)
        return {}


if __name__ == '__main__':
    if len(sys.argv) != 2:
        print(json.dumps({"error": "Usage: python_analyzer.py <file_path>"}), file=sys.stderr)
        sys.exit(1)
    
    file_path = sys.argv[1]
    counts = count_imports(file_path)
    print(json.dumps(counts))
