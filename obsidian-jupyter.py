import argparse
import sys
from jupyter_client import KernelManager
import nbformat
from nbconvert import HTMLExporter
from nbclient import NotebookClient
from nbclient.exceptions import CellExecutionError
import json
import logging
from dataclasses import dataclass

@dataclass
class Client:
    km: KernelManager
    client: NotebookClient

# Parse input arguments.
parser = argparse.ArgumentParser()
parser.add_argument('document_id')
args = parser.parse_args()

# Set up a logger that writes to stderr.
logging.basicConfig(level='INFO')
logger = logging.getLogger('obsidian-jupyter')
logger.info('started server for document %s', args.document_id)

# Create a notebook and kernel.
cell = nbformat.v4.new_code_cell()
nb = nbformat.v4.new_notebook(cells=[cell])

# Persistent Kernels
clients = {}

# Use line buffering.
sys.stdout.reconfigure(line_buffering=True)

try:
    # Respond to each request.
    for request in sys.stdin:
        # Load the request and generate a response with matching id.
        logger.info('received request: %s', request)
        request = json.loads(request)
        request_body = request['body']
        response = {
            'id': request['id'],
        }
        kernel_name = request_body['kernelName']

        # Initialize Kernel, if necessary
        if not kernel_name in clients:
            logger.info('Creating new kernel: %s', kernel_name)
            km = KernelManager(kernel_name=kernel_name)
            clients[kernel_name] = Client(km, NotebookClient(nb, km))

        client = clients[kernel_name].client
        km = clients[kernel_name].km

        # Execute a cell.
        if request_body['command'] == 'execute':
            cell['source'] = request_body['source']
            try:
                nb = client.execute(nb)
            except CellExecutionError as ex:
                logger.info('cell failed to execute: %s', ex)
            html_exporter = HTMLExporter(template_name='basic')
            (response_body, resources) = html_exporter.from_notebook_node(nb)
        elif request_body['command'] == 'restart_kernel':
            km.restart_kernel()
            response_body = ''
        else:
            logger.error('unrecognised command: %s', request_body['command'])
            response_body = ''

        # Pass the response back.
        response['body'] = response_body
        response = json.dumps(response)
        sys.stdout.write(response + '\n')
        sys.stdout.flush()
        logger.info('sent response: %s', response)
finally:
    # Clean up the kernels.
    for k, client in clients.items():
        if client.km.is_alive:
            logger.info('shutting down the %s kernel.', k)
            client.km.shutdown_kernel()

logger.info('exiting...')
