#!/usr/bin/env python3
"""
Script pour parser un dossier de projet et combiner tous les fichiers de code
en un seul fichier texte, avec des indicateurs clairs pour chaque fichier.
"""

import os
import argparse
from pathlib import Path
import fnmatch

# Extensions de fichiers de code courantes
CODE_EXTENSIONS = {
    # Python
    '.py', '.pyw', '.ipynb',
    # Web
    '.html', '.htm', '.css', '.scss', '.sass', '.less', '.js', '.jsx', '.ts', '.tsx', '.vue',
    # Backend
    '.php', '.rb', '.pl', '.pm', '.t', '.java', '.kt', '.kts', '.scala', '.go', '.rs',
    # C/C++
    '.c', '.h', '.cpp', '.hpp', '.cc', '.cxx', '.hh', '.hxx',
    # C#
    '.cs', '.cshtml', '.vb',
    # Data & Config
    '.json', '.xml', '.yaml', '.yml', '.toml', '.ini', '.cfg', '.conf',
    # Shell & Scripts
    '.sh', '.bash', '.zsh', '.fish', '.ps1', '.bat', '.cmd',
    # SQL
    '.sql', '.mysql', '.pgsql',
    # Markdown/Documentation
    '.md', '.rst', '.txt', '.tex',
    # Autres
    '.swift', '.m', '.mm', '.dart', '.lua', '.r', '.jl', '.ex', '.exs'
}

# Dossiers à ignorer par défaut
IGNORE_DIRS = {
    '__pycache__', '.git', '.svn', '.hg', '.idea', '.vscode',
    'node_modules', 'venv', 'env', '.env', 'dist', 'build',
    'target', 'bin', 'obj', 'out', '.next', '.nuxt',
    'vendor', 'bower_components', 'jspm_packages',
    '__MACOSX', '.DS_Store'
}

# Fichiers à ignorer par défaut
IGNORE_FILES = {
    '*.pyc', '*.pyo', '*.pyd', '*.so', '*.dll', '*.dylib',
    '*.class', '*.exe', '*.msi', '*.msm', '*.msp',
    '*.jpg', '*.jpeg', '*.png', '*.gif', '*.bmp', '*.ico',
    '*.mp3', '*.mp4', '*.avi', '*.mov', '*.wmv',
    '*.zip', '*.tar', '*.gz', '*.rar', '*.7z',
    '*.pdf', '*.doc', '*.docx', '*.xls', '*.xlsx',
    '*.log', '*.tmp', '*.temp', '*.cache',
    '.DS_Store', 'Thumbs.db'
}

def should_ignore(path, ignore_dirs=None, ignore_files=None):
    """Vérifie si un fichier ou dossier doit être ignoré."""
    name = path.name
    
    # Vérifier les dossiers à ignorer
    if path.is_dir():
        if ignore_dirs and name in ignore_dirs:
            return True
        if IGNORE_DIRS and name in IGNORE_DIRS:
            return True
    
    # Vérifier les fichiers à ignorer (pattern matching)
    if path.is_file():
        if ignore_files:
            for pattern in ignore_files:
                if fnmatch.fnmatch(name, pattern):
                    return True
        for pattern in IGNORE_FILES:
            if fnmatch.fnmatch(name, pattern):
                return True
    
    return False

def parse_project(project_path, output_file, extensions=None, ignore_dirs=None, 
                  ignore_files=None, include_binary=False, max_file_size=10*1024*1024):
    """
    Parse un dossier de projet et écrit tous les fichiers dans un fichier de sortie.
    
    Args:
        project_path: Chemin du dossier projet
        output_file: Chemin du fichier de sortie
        extensions: Set d'extensions à inclure (None pour toutes les extensions par défaut)
        ignore_dirs: Set de dossiers à ignorer
        ignore_files: Set de patterns de fichiers à ignorer
        include_binary: Inclure les fichiers binaires (déconseillé)
        max_file_size: Taille max des fichiers en bytes (défaut: 10MB)
    """
    project_root = Path(project_path).resolve()
    output_path = Path(output_file).resolve()
    
    if not project_root.exists():
        print(f"Erreur: Le dossier {project_root} n'existe pas.")
        return
    
    if not project_root.is_dir():
        print(f"Erreur: {project_root} n'est pas un dossier.")
        return
    
    # Éviter d'écrire dans le dossier projet
    if output_path.parent == project_root:
        print("Attention: Le fichier de sortie est dans le dossier projet. Utilisation d'un nom différent...")
        output_path = project_root / f"project_export_{output_path.name}"
    
    files_processed = 0
    files_skipped = 0
    files_too_large = 0
    total_size = 0
    
    with open(output_path, 'w', encoding='utf-8') as outfile:
        outfile.write(f"# EXPORT DU PROJET: {project_root.name}\n")
        outfile.write(f"# DATE: {__import__('datetime').datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
        outfile.write("#" + "="*78 + "\n\n")
        
        for root, dirs, files in os.walk(project_root):
            # Convertir le chemin en Path
            current_dir = Path(root)
            
            # Filtrer les dossiers à ignorer (modification sur place)
            dirs[:] = [d for d in dirs if not should_ignore(current_dir / d, ignore_dirs, {})]
            
            # Trier les fichiers pour un ordre cohérent
            files.sort()
            
            for file in files:
                file_path = current_dir / file
                
                # Vérifier si le fichier doit être ignoré
                if should_ignore(file_path, set(), ignore_files):
                    files_skipped += 1
                    continue
                
                # Vérifier l'extension
                if extensions and file_path.suffix.lower() not in extensions:
                    files_skipped += 1
                    continue
                
                # Vérifier la taille du fichier
                try:
                    file_size = file_path.stat().st_size
                    if file_size > max_file_size:
                        print(f"Fichier trop grand ignoré: {file_path.relative_to(project_root)} ({file_size/1024/1024:.1f} MB)")
                        files_too_large += 1
                        continue
                    
                    # Essayer de lire le fichier
                    try:
                        with open(file_path, 'r', encoding='utf-8') as infile:
                            content = infile.read()
                    except UnicodeDecodeError:
                        if include_binary:
                            # Lire en binaire et tenter de décoder
                            with open(file_path, 'rb') as infile:
                                content = str(infile.read())[:1000] + "... [contenu binaire tronqué]"
                        else:
                            print(f"Fichier binaire ignoré: {file_path.relative_to(project_root)}")
                            files_skipped += 1
                            continue
                    
                    # Écrire l'en-tête du fichier dans la sortie
                    rel_path = file_path.relative_to(project_root)
                    outfile.write(f"\n{'='*80}\n")
                    outfile.write(f"FICHIER: {rel_path}\n")
                    outfile.write(f"{'='*80}\n\n")
                    outfile.write(content)
                    outfile.write("\n\n")
                    
                    files_processed += 1
                    total_size += file_size
                    
                    # Afficher la progression
                    if files_processed % 10 == 0:
                        print(f"Fichiers traités: {files_processed}")
                        
                except Exception as e:
                    print(f"Erreur lors de la lecture de {file_path}: {e}")
                    files_skipped += 1
    
    # Afficher le résumé
    print(f"\n{'='*50}")
    print(f"RÉSUMÉ DE L'EXPORTATION")
    print(f"{'='*50}")
    print(f"Dossier projet: {project_root}")
    print(f"Fichier de sortie: {output_path}")
    print(f"Fichiers traités: {files_processed}")
    print(f"Fichiers ignorés: {files_skipped}")
    print(f"Fichiers trop volumineux: {files_too_large}")
    print(f"Taille totale: {total_size/1024/1024:.2f} MB")
    print(f"{'='*50}")

def main():
    parser = argparse.ArgumentParser(
        description="Parse un dossier de projet et combine tous les fichiers de code en un seul fichier texte."
    )
    parser.add_argument('project_path', help='Chemin du dossier projet à parser')
    parser.add_argument('-o', '--output', default='project_export.txt', 
                       help='Fichier de sortie (défaut: project_export.txt)')
    parser.add_argument('-e', '--extensions', nargs='+', 
                       help='Extensions à inclure (ex: .py .js .html)')
    parser.add_argument('--ignore-dirs', nargs='+', default=[],
                       help='Dossiers supplémentaires à ignorer')
    parser.add_argument('--ignore-files', nargs='+', default=[],
                       help='Patterns de fichiers supplémentaires à ignorer')
    parser.add_argument('--include-binary', action='store_true',
                       help='Inclure les fichiers binaires (déconseillé)')
    parser.add_argument('--max-size', type=int, default=10,
                       help='Taille max des fichiers en MB (défaut: 10)')
    parser.add_argument('--use-default-exts', action='store_true',
                       help='Utiliser les extensions par défaut (tous les fichiers de code courants)')
    
    args = parser.parse_args()
    
    # Déterminer les extensions à utiliser
    extensions = None
    if args.use_default_exts:
        extensions = CODE_EXTENSIONS
    elif args.extensions:
        # S'assurer que les extensions commencent par un point
        extensions = {ext if ext.startswith('.') else f'.{ext}' for ext in args.extensions}
    
    # Combiner les dossiers à ignorer
    ignore_dirs = set(args.ignore_dirs) if args.ignore_dirs else None
    
    # Combiner les patterns de fichiers à ignorer
    ignore_files = set(args.ignore_files) if args.ignore_files else None
    
    # Convertir la taille max en bytes
    max_file_size = args.max_size * 1024 * 1024
    
    # Exécuter le parsing
    parse_project(
        args.project_path, 
        args.output,
        extensions=extensions,
        ignore_dirs=ignore_dirs,
        ignore_files=ignore_files,
        include_binary=args.include_binary,
        max_file_size=max_file_size
    )

if __name__ == "__main__":
    main()