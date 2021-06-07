import {
	App,
	MarkdownPostProcessorContext,
	Plugin,
	PluginSettingTab,
	Setting,
	FileSystemAdapter,
	MarkdownRenderer
} from 'obsidian';
import { exec } from 'child_process';

interface JupyterPluginSettings {
	pythonInterpreter: string;
}

const DEFAULT_SETTINGS: JupyterPluginSettings = {
	pythonInterpreter: 'python'
}

export default class JupyterPlugin extends Plugin {
	settings: JupyterPluginSettings;

	async postprocessor(src: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) {
		// Render the code using the default renderer for python.
		await MarkdownRenderer.renderMarkdown('```python\n' + src + '```', el, '', this.app.workspace.activeLeaf.view);

		// Needed for positioning of the button and hiding Jupyter prompts.
		el.classList.add('obsidian-jupyter');

		// Add a button to run the code.
		var button = el.createEl('button');
		button.type = 'button';
		button.innerText = 'Run';
		button.className = 'obsidian-jupyter-run-button';
		button.addEventListener('click', () => {
			button.innerText = 'Running...';
			let options = {
				cwd: (this.app.vault.adapter as FileSystemAdapter).getBasePath(),
			};
			let cmd = `${this.settings.pythonInterpreter} ${this.app.vault.configDir}/plugins/obsidian-jupyter/convert.py`;
			let child = exec(cmd, options, (error, stdout, stderr) => {
				// Find the div to paste the output into or create it if necessary.
				var output = el.querySelector('div.obsidian-jupyter-output');
				if (output == null) {
					output = el.createEl('div');
					output.classList.add('obsidian-jupyter-output');
				}
				// Paste the output and reset the button.
				output.innerHTML = stdout;
				button.innerText = 'Run';
			});
			// Send the code to execute to the conversion script.
			child.stdin.write(src);
			child.stdin.end();
		});
	}

	async onload() {
		console.log('loading jupyter plugin');

		await this.loadSettings();

		this.addSettingTab(new JupyterSettingTab(this.app, this));
		this.registerMarkdownCodeBlockProcessor('jupyter', this.postprocessor.bind(this));
	}

	onunload() {
		console.log('unloading jupyter plugin');
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
