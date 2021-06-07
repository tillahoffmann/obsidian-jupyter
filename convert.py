import os
import sys
from jinja2 import DictLoader
import nbformat
from nbconvert import HTMLExporter
from nbconvert.preprocessors import ExecutePreprocessor, CellExecutionError

# Construct a notebook to execute.
code = sys.stdin.read()
nb = nbformat.from_dict({
    'cells': [
        {
            "source": code,
            "metadata": {},
            'cell_type': 'code',
        }
    ],
    'metadata': {},
    'nbformat': 4,
    'nbformat_minor': 5,
})

# Execute the notebook and save it.
try:
    ep = ExecutePreprocessor()
    ep.preprocess(nb, {'metadata': {'path': os.getcwd()}})
except CellExecutionError:
    pass
finally:
    # Custom template to hide the input cell.
    dict_loader = DictLoader({
        'obsidian': '''
            {%- extends 'basic/index.html.j2' -%}
            {% block input_group %}{% endblock input_group %}
        '''
    })
    html_exporter = HTMLExporter(template_file='obsidian', extra_loaders=[dict_loader])
    (body, resources) = html_exporter.from_notebook_node(nb)
    print(body)
