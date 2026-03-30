import os, re

files = {}
for root, _, fs in os.walk('js'):
    for f in fs:
        if f.endswith('.js'):
            with open(os.path.join(root,f), 'r', encoding='utf-8') as file:
                files[os.path.join(root,f).replace('\\','/')] = file.read()

exports = {}
for name, content in files.items():
    exports[name] = set(re.findall(r'export\s+(?:async\s+)?(?:function|const|let|var)\s+([a-zA-Z0-9_]+)', content))

errors = []
for name, content in files.items():
    for imp in re.finditer(r'import\s+\{([^}]+)\}\s+from\s+[\'"](.*?)[\'"]', content):
        vars = [v.split(' as ')[0].strip() for v in imp.group(1).split(',')]
        path = imp.group(2)
        dir_name = os.path.dirname(name)
        abs_path = os.path.normpath(os.path.join(dir_name, path)).replace('\\','/')
        if abs_path in exports:
            for v in vars:
                if v and v not in exports[abs_path] and v != 'default':
                    errors.append(f"{name} -> missing '{v}' from {abs_path}")
        else:
            errors.append(f"{name} -> module {abs_path} not found")

if errors:
    print("ERRORS:")
    for e in errors:
        print(e)
else:
    print("ALL OK")
