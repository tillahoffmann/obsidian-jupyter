import argparse
import json


def dump(object, filename):
    with open(filename, 'w') as fp:
        json.dump(object, fp, indent=4, sort_keys=True)
        # Add final newline.
        fp.write('\n')


parser = argparse.ArgumentParser()
parser.add_argument('version')
args = parser.parse_args()

indent = 4
for filename in ['package.json', 'manifest.json']:
    with open(filename) as fp:
        data = json.load(fp)
    data['version'] = args.version
    dump(data, filename)


# Add to the versions.json using the data from the manifest.
with open('versions.json') as fp:
    versions = json.load(fp)
versions[args.version] = data['minAppVersion']
dump(versions, 'versions.json')
