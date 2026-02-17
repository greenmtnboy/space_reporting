import os
import json
from pathlib import Path

def bundle_models(raw_dir, output_file):
    models = []
    for filename in os.listdir(raw_dir):
        if filename.endswith('.preql'):
            path = os.path.join(raw_dir, filename)
            with open(path, 'r', encoding='utf-8') as f:
                content = f.read()
            
            models.append({
                'id': filename,
                'name': filename.replace('.preql', ''),
                'contents': content,
                'type': 'preql'
            })
    
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(models, f, indent=2)
    
    print(f"Bundled {len(models)} models into {output_file}")

if __name__ == "__main__":
    script_dir = Path(__file__).resolve().parent
    project_root = script_dir.parent
    bundle_models(
        raw_dir=project_root / 'data' / 'raw',
        output_file=project_root / 'src' / 'public' / 'models.json'
    )
