# Convenciones Git

## Ramas
- `main`: versión estable.
- `develop`: integración.
- `feature/nombre`: funcionalidades.
- `fix/nombre`: correcciones.
- `docs/nombre`: documentación.

## Commits
- `feat:` nueva funcionalidad.
- `fix:` corrección.
- `docs:` documentación.
- `test:` pruebas.
- `refactor:` mejora interna.
- `chore:` tareas técnicas.

## Primeros commits recomendados
```bash
git init
git add .
git commit -m "chore: inicializar estructura del proyecto"
git branch -M main
git checkout -b develop
```
