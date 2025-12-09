#!/usr/bin/env python3
"""
Java import analyzer - counts individual imports and calculates cyclomatic complexity.
Usage: java_analyzer.py <file_path>
Output: JSON with import counts and complexity
"""

import re
import sys
import json
from typing import Dict


def calculate_complexity(content: str) -> int:
    """
    Calculate cyclomatic complexity by counting decision points in Java code.
    
    Cyclomatic complexity = 1 + number of decision points
    Decision points include:
    - if statements
    - for/while/do-while loops
    - case statements in switch
    - catch blocks
    - ternary operators (? :)
    - logical operators (&& and ||)
    """
    complexity = 1  # Base complexity
    
    # Remove comments to avoid counting keywords in comments
    # Remove single-line comments
    content = re.sub(r'//.*?$', '', content, flags=re.MULTILINE)
    # Remove multi-line comments
    content = re.sub(r'/\*.*?\*/', '', content, flags=re.DOTALL)
    # Remove strings to avoid counting keywords in strings
    content = re.sub(r'"(?:[^"\\]|\\.)*"', '', content)
    content = re.sub(r"'(?:[^'\\]|\\.)*'", '', content)
    
    # Count if statements
    complexity += len(re.findall(r'\bif\s*\(', content))
    
    # Count for loops
    complexity += len(re.findall(r'\bfor\s*\(', content))
    
    # Count while loops
    complexity += len(re.findall(r'\bwhile\s*\(', content))
    
    # Count do-while loops
    complexity += len(re.findall(r'\bdo\s*\{', content))
    
    # Count case statements (excluding default)
    complexity += len(re.findall(r'\bcase\s+', content))
    
    # Count catch blocks
    complexity += len(re.findall(r'\bcatch\s*\(', content))
    
    # Count ternary operators
    complexity += len(re.findall(r'\?[^:]*:', content))
    
    # Count logical AND operators (but not bitwise &)
    complexity += len(re.findall(r'&&', content))
    
    # Count logical OR operators (but not bitwise |)
    complexity += len(re.findall(r'\|\|', content))
    
    return complexity


def count_imports(content: str) -> Dict[str, int]:
    """
    Count the number of imports from each package/class.
    
    Examples:
    - import java.util.List; -> {'java.util.List': 1}
    - import java.util.*; -> {'java.util.*': 1}
    - import static org.junit.Assert.assertEquals; -> {'org.junit.Assert.assertEquals': 1}
    """
    import_counts: Dict[str, int] = {}
    
    # Match import statements (including static imports)
    # Pattern: import [static] package.name[.*];
    import_pattern = r'^\s*import\s+(?:static\s+)?([a-zA-Z_][\w.]*(?:\.\*)?)\s*;'
    
    for match in re.finditer(import_pattern, content, re.MULTILINE):
        import_name = match.group(1)
        import_counts[import_name] = import_counts.get(import_name, 0) + 1
    
    return import_counts


if __name__ == '__main__':
    if len(sys.argv) != 2:
        print(json.dumps({"error": "Usage: java_analyzer.py <file_path>"}), file=sys.stderr)
        sys.exit(1)
    
    file_path = sys.argv[1]
    
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
        
        # Calculate both imports and complexity
        imports = count_imports(content)
        complexity = calculate_complexity(content)
        
        # Return both in the JSON output
        result = {
            "imports": imports,
            "complexity": complexity
        }
        print(json.dumps(result))
    
    except Exception as e:
        print(json.dumps({"error": str(e)}), file=sys.stderr)
        sys.exit(1)
