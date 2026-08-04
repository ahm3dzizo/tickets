import os

for root, _, files in os.walk('src'):
    for f in files:
        if f.endswith('.tsx') or f.endswith('.ts'):
            path = os.path.join(root, f)
            with open(path, 'r', encoding='utf-8') as file:
                content = file.read()
            if '/logo.jpg' in content or '/retal-logo.jpg' in content:
                new_content = content.replace('/logo.jpg', '/logo.png').replace('/retal-logo.jpg', '/logo.png')
                with open(path, 'w', encoding='utf-8') as file:
                    file.write(new_content)

with open('index.html', 'r', encoding='utf-8') as f:
    content = f.read()
content = content.replace('/logo.jpg', '/favicon.ico').replace('image/jpeg', 'image/x-icon')
with open('index.html', 'w', encoding='utf-8') as f:
    f.write(content)

with open('vite.config.ts', 'r', encoding='utf-8') as f:
    content = f.read()
content = content.replace("'logo.jpg', ", "").replace("'logo.jpg'", "")
with open('vite.config.ts', 'w', encoding='utf-8') as f:
    f.write(content)
