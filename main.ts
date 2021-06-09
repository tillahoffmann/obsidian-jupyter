import {
	App,
	MarkdownPostProcessorContext,
	Plugin,
	PluginSettingTab,
	Setting,
	FileSystemAdapter,
	MarkdownRenderer
} from 'obsidian';
import { spawn, ChildProcess } from 'child_process';
import { v4 as uuid } from 'uuid';

interface JupyterPluginSettings {
	pythonInterpreter: string;
}

const DEFAULT_SETTINGS: JupyterPluginSettings = {
	pythonInterpreter: 'python'
}


class JupyterClient {
	process: ChildProcess;
	promises: Map<string, any>;
	stdinParts: string[];

	processStdIn(data: any) {
		this.stdinParts.push(data.toString());
		if (this.stdinParts.last().endsWith('\n')) {
			let response = JSON.parse(this.stdinParts.join(''));
			this.stdinParts = [];
			let promise = this.promises.get(response.id);
			if (promise === undefined) {
				console.error(`received response for unrecognised promise: ${response.id}`);
				return;
			}
			promise(response.body);
		}
	}

	processStdErr(data: any) {
		console.log(data.toString());
	}

	constructor (cmd: string, args?: string[], options?: any) {
		this.process = spawn(cmd, args, options);
		this.process.stdout.on('data', this.processStdIn.bind(this));
		this.process.stderr.on('data', this.processStdErr.bind(this));
		this.process.on('error', console.log);
		this.promises = new Map();
		this.stdinParts = [];
	}

	async request(body: any): Promise<any> {
		// Generate a random identifier.
		var id = uuid();
		// Send the request (\n terminated to make sure it gets picked up by the python process).
		var data = JSON.stringify({id: id, body: body});
		this.process.stdin.write(data + '\n');
		// Create a resolvable promise and store it against the id.
		var resolve;
		var reject;
		var promise = new Promise((resolve_, reject_) => {
			resolve = resolve_;
			reject = reject_;
		})
		this.promises.set(id, resolve);
		return promise;
	}

	stop() {
		this.process.stdin.end();
	}
}

export default class JupyterPlugin extends Plugin {
	settings: JupyterPluginSettings;
	clients: Map<string, JupyterClient>;

	async postprocessor(src: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) {
		// Render the code using the default renderer for python.
		await MarkdownRenderer.renderMarkdown('```python\n' + src + '```', el, '',
											  this.app.workspace.activeLeaf.view);

		// Needed for positioning of the button and hiding Jupyter prompts.
		el.classList.add('obsidian-jupyter');

		// Add a button to run the code.
		var button = el.createEl('button');
		button.type = 'button';
		button.innerText = 'Run';
		button.className = 'obsidian-jupyter-run-button';
		button.addEventListener('click', () => {
			button.innerText = 'Running...';
			this.getJupyterClient(ctx.docId).request({
				command: 'execute',
				source: src,
			}).then(response => {
				// Find the div to paste the output into or create it if necessary.
				var output = el.querySelector('div.obsidian-jupyter-output');
				if (output == null) {
					output = el.createEl('div');
					output.classList.add('obsidian-jupyter-output');
				}
				// Paste the output and reset the button.
				output.innerHTML = response;
				button.innerText = 'Run';
			});
		});
	}

	getJupyterClient(docId: string): JupyterClient {
		let client = this.clients.get(docId);
		if (client === undefined) {
			let options = {
				cwd: (this.app.vault.adapter as FileSystemAdapter).getBasePath(),
			};
			let path = `${this.app.vault.configDir}/plugins/obsidian-jupyter/obsidian-jupyter.py`;
			client = new JupyterClient(this.settings.pythonInterpreter, [path, docId], options);
			this.clients.set(docId, client);
			console.log(`created new client for doc ${docId}`);
		}
		return client;
	}

	async onload() {
		console.log('loading jupyter plugin');

		await this.loadSettings();

		this.addSettingTab(new JupyterSettingTab(this.app, this));
		this.registerMarkdownCodeBlockProcessor('jupyter', this.postprocessor.bind(this));
		this.clients = new Map();
	}

	onunload() {
		console.log('unloading jupyter plugin');
		this.clients.forEach((client, docId) => {
			console.log(`stopping client for doc ${docId}...`);
			client.stop();
		});
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

class JupyterSettingTab extends PluginSettingTab {
	plugin: JupyterPlugin;

	constructor(app: App, plugin: JupyterPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		let { containerEl } = this;

		containerEl.empty();

		new Setting(containerEl)
			.setName('Python interpreter')
			.setDesc('Path to your python interpreter')
			.addText(text => text
				.setValue(this.plugin.settings.pythonInterpreter)
				.onChange(async (value) => {
					this.plugin.settings.pythonInterpreter = value;
					await this.plugin.saveSettings();
				}));
	}
}
