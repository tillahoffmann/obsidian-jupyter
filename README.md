# ⚠️ This plugin is deprecated and no longer maintained.

Obsidian has evolved, and integrating the plugin with the new live preview editor is non-trivial. Here is an alternative setup that is future proof, less prone to bugs, and supports many of the requested features (such as storing outputs and supporting `input` calls).

1. Set up your python distribution, install Jupyter Lab and Jupytext for markdown-based notebooks: `pip install jupyterlab jupytext [other dependencies]`.
2. Run `jupyter lab` from the root directory of your vault.
3. Right-click on any markdown file and select `Open With > Notebook` to open the Obsidian note as a Jupyter notebook.

Optionally, you can ["pair"](https://jupytext.readthedocs.io/en/latest/paired-notebooks.html) markdown-based notebooks with classic notebook files (`.ipynb` extension) to keep the results if you close and reopen a notebook. To do so, add a `jupytext.toml` file to the root directory of your vault containing the following code. This will create a hidden `.ipynb` directory containing the results of your notebook for later use.

```toml
formats = "md,.ipynb//ipynb"
```

Unfortunately, this option does not support Jupyter notebooks *within* Obsidian, but reproducing the Jupyter experience would be a substantial undertaking.

---

# Obsidian Jupyter Plugin ![](https://img.shields.io/badge/stability-alpha-f4d03f.svg) [![Release Obsidian Plugin](https://github.com/tillahoffmann/obsidian-jupyter/actions/workflows/release.yml/badge.svg)](https://github.com/tillahoffmann/obsidian-jupyter/actions/workflows/release.yml) ![](https://img.shields.io/badge/python-≥3.7-blue)

This plugin allows python code blocks in fences with `jupyter` language to be executed as Jupyter notebooks.

![](obsidian-jupyter.gif)

## Installation

1. Install the plugin via the community plugins settings tab in Obsidian.
2. Specify the python interpreter path in the settings tab of the plugin. If you don't know what your interpreter path is, run `python -c 'import sys; print(sys.executable)'` from the console. The python version should be at least 3.7.
3. Verify that jupyter is installed. If you're unsure, run `pip install jupyter --upgrade` from the console to install the latest version. You can also use the `Install dependencies` button in the settings to install the requirements.

This plugin has been tested with the following python dependencies. If you encounter problems, please update your python dependencies before opening an issue.

```
jupyter==1.0.0
jupyter-client==7.0.2
jupyter-console==6.4.0
jupyter-core==4.7.1
jupyterlab-pygments==0.1.2
jupyterlab-widgets==1.0.1
nbclient==0.5.4
nbconvert==6.1.0
nbformat==5.1.3
notebook=6.4.3
```

## Settings

* Python interpreter: path to the python interpreter used to execute code, e.g. `/usr/bin/python`.
* Setup script: script that is run prior to every execution of a python code block.

The python interpreter can also be specified for each document using YAML frontmatter.

```yaml
---
obsidian-jupyter:
 interpreter: interpreter-path
---
```
