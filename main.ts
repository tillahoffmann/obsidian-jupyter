import {
	App,
	MarkdownPostProcessorContext,
	Plugin,
	PluginSettingTab,
	Setting,
	FileSystemAdapter,
	MarkdownRenderer,
	Notice,
	WorkspaceLeaf,
	FileView,
	TFile
} from 'obsidian';
import { spawn, exec, ChildProcess } from 'child_process';
import { v4 as uuid } from 'uuid';
import { statSync, writeFileSync, readFileSync, rm } from 'fs';
import { HttpClient } from 'typed-rest-client/HttpClient';
import { tmpdir } from 'os';


// https://stackoverflow.com/a/47614491/1150961.
function setInnerHTML(elm: Element, html: string) {
	elm.innerHTML = html;
	Array.from(elm.querySelectorAll("script")).forEach( oldScript => {
		const newScript = document.createElement("script");
		Array.from(oldScript.attributes)
		.forEach( attr => newScript.setAttribute(attr.name, attr.value) );
		newScript.appendChild(document.createTextNode(oldScript.innerHTML));
		oldScript.parentNode.replaceChild(newScript, oldScript);
	});
}

interface JupyterPluginSettings {
	pythonInterpreter: string;
	setupScript: string;
}

const DEFAULT_SETTINGS: JupyterPluginSettings = {
	pythonInterpreter: 'python',
	setupScript: '',
}

class JupterPreview extends FileView {
	interpreter: string;

	constructor(leaf: WorkspaceLeaf, interpreter: string) {
		super(leaf);
		// Show a placeholder before we've converted the notebook.
		this.contentEl.innerHTML = 'Converting notebook...';
		this.interpreter = interpreter;
	}

	onLoadFile(file: TFile): Promise<void> {
		// Get the base path of the vault.
		let adapter = file.vault.adapter;
		if (!(adapter instanceof FileSystemAdapter)) {
			this.contentEl.innerHTML = 'Could not determine notebook path.';
			return null;
		}
		// Convert the file by writing it to a temporary location. Piping unfortunately leads to
		// problems for long lines due to buffer overflows.
		let basePath = adapter.getBasePath();
		let filename = `${basePath}/${file.path}`;
		let htmlPath = `${tmpdir()}/${uuid()}.html`;
		let args = ['-m', 'nbconvert', `--output=${htmlPath}`, '--to=html', filename];
		let child = spawn(this.interpreter, args);

		// Process the output and delete the temporary file.
		child.on('close', (code: number) => {
			if (code) {
				this.contentEl.innerHTML = 'Failed to convert notebook to HTML.';
			} else {
				// Create the frame for rendering.
				let frame = document.createElement('iframe');
				frame.addClass('notebookPreview')
				const html = readFileSync(htmlPath).toString();
				const blob = new Blob([html], {type: 'text/html'});
				frame.src = window.URL.createObjectURL(blob);

				// Insert the frame and hook up to resize events.
				this.contentEl.innerHTML = '';
				this.contentEl.addClass('notebookPreview');
				this.contentEl.appendChild(frame);
				new ResizeObserver((entries) => {
					for (let entry of entries) {
						frame.height = `${entry.contentRect.height - 6}px`;
					}
				}).observe(this.contentEl);
			}
			rm(htmlPath, () => null);
		})
		return null;
	}

	getViewType(): string {
		return 'ipynb';
	}

	canAcceptExtension(extension: string): boolean {
		return extension === 'ipynb';
	}
}

class JupyterClient {
	process: ChildProcess;
	promises: Map<string, any>;
	stdoutParts: string[];
	interpreter: string;

	processStdOut(data: any) {
		this.stdoutParts.push(data.toString());
		if (this.stdoutParts.last().endsWith('\n')) {
			let response = JSON.parse(this.stdoutParts.join(''));
			console.log('received response', response);
			this.stdoutParts = [];
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

	constructor (interpreter: string, args?: string[], options?: any) {
		this.interpreter = interpreter;
		this.process = spawn(interpreter, args, options);
		this.process.stdout.on('data', this.processStdOut.bind(this));
		this.process.stderr.on('data', this.processStdErr.bind(this));
		this.process.on('error', console.log);
		this.promises = new Map();
		this.stdoutParts = [];
	}

	async request(body: any): Promise<any> {
		// Generate a random identifier.
		let id = uuid();
		// Send the request (\n terminated to make sure it gets picked up by the python process).
		let data = JSON.stringify({id: id, body: body});
		this.process.stdin.write(data + '\n');
		// Create a resolvable promise and store it against the id.
		let resolve;
		let reject;
		let promise = new Promise((resolve_, reject_) => {
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
		await MarkdownRenderer.renderMarkdown('```python\n' + src + '\n```', el, '',
											  this.app.workspace.activeLeaf.view);

		// Needed for positioning of the button and hiding Jupyter prompts.
		el.classList.add('obsidian-jupyter');
		// Add a button to run the code.
		let button = el.querySelector('pre').createEl('button', {
			type: 'button',
			text: 'Run',
			cls: 'copy-code-button',
		});
		button.setAttribute('style', `right: 32pt`);
		button.addEventListener('click', () => {
			button.innerText = 'Running...';
			this.getJupyterClient(ctx).request({
				command: 'execute',
				source: `${this.settings.setupScript}\n${src}`,
			}).then(response => {
				// Find the div to paste the output into or create it if necessary.
				let output = el.querySelector('div.obsidian-jupyter-output');
				if (output == null) {
					output = el.createEl('div');
					output.classList.add('obsidian-jupyter-output');
				}
				// Paste the output and reset the button.
				setInnerHTML(output, response);
				button.innerText = 'Run';
			});
		});
	}

	getJupyterClient(ctx: MarkdownPostProcessorContext): JupyterClient {
		let client = this.clients.get(ctx.docId);
		// Construct the interpeter path.
		let cache = this.app.metadataCache.getCache(ctx.sourcePath);
		let frontmatter: any = (cache ? cache.frontmatter : {}) || {};
		let interpreter = (frontmatter['obsidian-jupyter'] || {})['interpreter'] || this.settings.pythonInterpreter;
		// If we have a client, check that the interpreter path is right and stop it if not.
		if (client && client.interpreter != interpreter) {
			console.log(`interpreter path (${client.interpreter}) for the client for doc ` +
						`${ctx.docId} does not match the desired path (${interpreter})`);
			client.stop();
			client = undefined;
		}

		// Create a new interpreter if required.
		if (client === undefined) {
			let options = {cwd: this.getBasePath()};
			let path = this.getRelativeScriptPath();
			client = new JupyterClient(interpreter, [path, ctx.docId], options);
			this.clients.set(ctx.docId, client);
			console.log(`created new client for doc ${ctx.docId} using interpreter ${interpreter}`);
		}
		return client;
	}

	createJupyterPreview(leaf: WorkspaceLeaf) {
		return new JupterPreview(leaf, this.settings.pythonInterpreter);
	}

	async onload() {
		console.log('loading jupyter plugin');
		this.clients = new Map();

		await this.loadSettings();
		await this.downloadPythonScript();

		this.addSettingTab(new JupyterSettingTab(this.app, this));
		this.registerMarkdownCodeBlockProcessor('jupyter', this.postprocessor.bind(this));
		this.registerView("ipynb", this.createJupyterPreview.bind(this));
		this.registerExtensions(["ipynb"], "ipynb");
	}

	async downloadPythonScript() {
		let path = this.getAbsoluteScriptPath();
		try {
			let stats = statSync(path);
			if (!stats.isFile()) {
				throw new Error('python script is missing');
			}
			console.log(`python script exists at ${path}`);
		} catch {
			console.log('downloading missing python script...');
			let client = new HttpClient('obsidian-jupyter');
			let url = `https://github.com/tillahoffmann/obsidian-jupyter/releases/download/${this.manifest.version}/obsidian-jupyter.py`;
			let response = await client.get(url);
			if (response.message.statusCode != 200) {
				throw new Error(`could not download missing python script: ${response.message.statusMessage}`);
			}
			let content = await response.readBody();
			writeFileSync(path, content);
			console.log('obtained missing python script');
		}
	}

	getRelativeScriptPath(): string {
		return `${this.app.vault.configDir}/plugins/obsidian-jupyter/obsidian-jupyter.py`;
	}

	getAbsoluteScriptPath(): string {
		return `${this.getBasePath()}/${this.getRelativeScriptPath()}`;
	}

	getBasePath(): string {
		if (this.app.vault.adapter instanceof FileSystemAdapter) {
			return (this.app.vault.adapter as FileSystemAdapter).getBasePath();
		}
		throw new Error('cannot determine base path');
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
			.setDesc('Path to your python interpreter, e.g. `/usr/bin/python`.')
			.setClass('wideSettingsElement')
			.addText(text => text
				.setValue(this.plugin.settings.pythonInterpreter)
				.onChange(async (value) => {
					this.plugin.settings.pythonInterpreter = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Python setup script')
			.setDesc('Script that is run prior to every execution of a python code block.')
			.setClass('setupScriptTextArea')
			.setClass('wideSettingsElement')
			.addTextArea(text => text
				.setValue(this.plugin.settings.setupScript)
				.onChange(async (value) => {
					this.plugin.settings.setupScript = value;
					await this.plugin.saveSettings();
				})
			);

		new Setting(containerEl)
			.setName('Test python environment')
			.setDesc('Run a script to test the setup of your python environment (view developer console for details).')
			.addButton(button => {
				button.setButtonText('Run test');
				button.onClick(evt => {
					let client = this.plugin.getJupyterClient({
						docId: 'test-document',
						sourcePath: null,
						frontmatter: null,
						addChild: null,
						getSectionInfo: null,
					});
					client.request({
						command: 'execute',
						source: '1 + 1',
					}).then(response => {
						console.log('Received response', response);
						new Notice('Test successful, view developer console for details.');
					}
					).catch(error => {
						console.error(error);
						new Notice('Test failed, view developer console for details.');
					}).finally(() => {
						client.stop();
						this.plugin.clients.delete('test-document');
					});
				});
			});

		new Setting(containerEl)
			.setName('Install python dependencies')
			.setDesc('This will modify your environment-use at your own risk.')
			.addButton(button => {
				button.setButtonText('Install dependencies');
				button.onClick(evt => {
					let interpreter = this.plugin.settings.pythonInterpreter;
					let command = `${interpreter} -u -m pip install --upgrade --upgrade-strategy eager jupyter`;
					new Notice('Installing dependencies; this may take some time...');
					exec(command, (error, stdout, stderr) => {
						if (error) {
							console.error(`failed to install dependencies: ${error}`);
							new Notice('Failed to install dependencies, view developer console for details.');
						} else {
							new Notice('Installed dependencies, view developer console for details.');
						}
						console.log(`install stdout: ${stdout}`);
						console.log(`install stderr: ${stderr}`);
					});
				});
			});
	}
}
