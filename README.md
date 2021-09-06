# Obsidian Jupyter Plugin ![](https://img.shields.io/badge/stability-alpha-f4d03f.svg) [![Release Obsidian Plugin](https://github.com/tillahoffmann/obsidian-jupyter/actions/workflows/release.yml/badge.svg)](https://github.com/tillahoffmann/obsidian-jupyter/actions/workflows/release.yml)

This plugin allows python code blocks in fences with `jupyter` language to be executed as Jupyter notebooks.

![](obsidian-jupyter.gif)

## Settings

* Python interpreter: path to the python interpreter used to execute code, e.g. `/usr/bin/python`.

The python interpreter can also be specified for each document using YAML frontmatter.

```yaml
---
obsidian-jupyter:
 interpreter: interpreter-path
---
```

## Known issues

* This plugin conflicts with the [banners plugin](https://github.com/noatpad/obsidian-banners) (see [#4](https://github.com/tillahoffmann/obsidian-jupyter/issues/4#issuecomment-913042968) for details).
