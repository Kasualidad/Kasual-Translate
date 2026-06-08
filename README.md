# Kasual Translate

Herramienta de extraccion, revision y traduccion para mods de Project Zomboid.

## Funciones principales

- Escaneo de mods en formato legacy `42 .txt`.
- Escaneo de mods en formato `42.15+ .json`.
- Editor visual con comparacion, preview y colores configurables.
- Gestor de proyectos para packs de traduccion ya creados.
- Flujo para anadir nuevos mods a un proyecto y revisar claves nuevas o duplicadas.
- Asistente IA configurable por el usuario mediante API key propia.
- Aplicacion Electron para Windows.
- Autoactualizacion mediante GitHub Releases.

## Desarrollo

```bash
npm install
npm run dev
```

## Build local

```bash
npm run electron:pack
```

El build local genera el ejecutable portable en `release/`.

## Publicar una version con autoactualizacion

1. Actualiza `version` en `package.json`.
2. Sube los cambios al repositorio.
3. Crea y sube un tag con el mismo numero:

```bash
git tag v2.0.1
git push origin v2.0.1
```

GitHub Actions compilara la app y publicara el portable en Releases. La app portable comprobara nuevas versiones al arrancar y cada 4 horas. Cuando exista una version nueva, abrira GitHub para descargar el `.exe` actualizado.

## Repositorio

https://github.com/Kasualidad/Kasual-Translate
