# Obsidian Jupyter Plugin

This plugin allows code blocks in fences with `jupyter` language to be executed as Jupyter notebooks.

![](obsidian-jupyter.gif)

## Settings

* Python interpreter: path to the python interpreter used to execute code.

The python interpreter can also be specified for each document using YAML frontmatter.

```yaml
---
obsidian-jupyter:
 interpreter: interpreter-path
---
```
