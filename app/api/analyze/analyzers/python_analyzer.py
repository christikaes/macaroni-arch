#!/usr/bin/env python3
"""
Python import analyzer - counts individual imports and calculates cyclomatic complexity.
Usage: python_analyzer.py <file_path>
Output: JSON with import counts and complexity
"""

import ast
import sys
import json
from pathlib import Path
from typing import Dict


def calculate_complexity(tree: ast.AST) -> int:
    """
    Calculate cyclomatic complexity by counting decision points in the AST.
    
    Cyclomatic complexity = 1 + number of decision points
    Decision points include:
    - If statements
    - For/While loops
    - Except handlers
    - Boolean operators (and, or)
    - Comprehensions (list, dict, set, generator)
    - Match/case statements (Python 3.10+)
    """
    complexity = 1  # Base complexity
    
    for node in ast.walk(tree):
        # Conditional statements
        if isinstance(node, ast.If):
            complexity += 1
        
        # Loops
        elif isinstance(node, (ast.For, ast.While, ast.AsyncFor)):
            complexity += 1
        
        # Exception handlers
        elif isinstance(node, ast.ExceptHandler):
            complexity += 1
        
        # Boolean operators (and, or)
        elif isinstance(node, ast.BoolOp):
            # Each additional operand adds 1 to complexity
            complexity += len(node.values) - 1
        
        # Comprehensions
        elif isinstance(node, (ast.ListComp, ast.DictComp, ast.SetComp, ast.GeneratorExp)):
            # Each generator/filter adds to complexity
            for generator in node.generators:
                complexity += 1
                # Each if clause in comprehension
                complexity += len(generator.ifs)
        
        # Match statements (Python 3.10+) - check if available
        elif hasattr(ast, 'Match') and isinstance(node, ast.Match):
            # Each case adds to complexity
            complexity += len(node.cases)
    
    return complexity


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
    
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            source = f.read()
        
        tree = ast.parse(source, filename=file_path)
        
        # Calculate both imports and complexity
        counts = count_imports(file_path)
        complexity = calculate_complexity(tree)
        
        # Return both in the JSON output
        result = {
            "imports": counts,
            "complexity": complexity
        }
        print(json.dumps(result))
    
    except Exception as e:
        print(json.dumps({"error": str(e)}), file=sys.stderr)
        sys.exit(1)
