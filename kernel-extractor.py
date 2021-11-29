import json
from jupyter_client.kernelspec import KernelSpecManager

specs = KernelSpecManager().get_all_specs()
result = {}
for key, spec in specs.items():
    result[key] = spec

result = json.dumps(result)
print(result)