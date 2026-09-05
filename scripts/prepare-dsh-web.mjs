import { createHash } from 'node:crypto'
import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { transformWithEsbuild } from 'vite'

const root = fileURLToPath(new URL('..', import.meta.url))
const publicDir = join(root, 'public')
const modulesRoot = join(root, 'node_modules', '@deepseek-ai')
const webDist = join(modulesRoot, 'dsh-web-frontend', 'dist')
const pqgModuleSettingsId = '@pqg/module-settings'
const excluded = new Set([
  // The Makers deployment has no native desktop directory chooser. The
  // native row is retained because the upstream Web composition selects it;
  // the browse twin would double-occupy the same UI seat.
  '@deepseek-ai/dsh-client-ui-directory-picker-browse',
  // Live Cordis editing assumes direct Host trust and opens a large secondary
  // RPC surface. Makers keeps the normal plugin inventory/settings UI but not
  // the self-modifying runtime panel.
  '@deepseek-ai/dsh-client-hmr',
  '@deepseek-ai/dsh-cordis-client-runner',
  '@deepseek-ai/dsh-client-ui-cordis',
])

function hash(value) {
  return createHash('sha256').update(value).digest('hex').slice(0, 12)
}

function mustReplace(source, find, replacement, label) {
  if (!source.includes(find)) {
    throw new Error(`Published DSH agent-preset bundle no longer matches the Makers lock patch point: ${label}`)
  }
  return source.replace(find, replacement)
}

function patchConnectionBundle(source) {
  const mux = 'return this.readWebSocket(MUX_EVENTS_PATH, signal, muxFrameSchema, onOpen);'
  const host = 'return this.readWebSocket(HOST_EVENTS_PATH, signal, hostFrameSchema, onOpen);'
  if (!source.includes(mux) || !source.includes(host)) {
    throw new Error('Published DSH connection bundle no longer matches the Makers SSE patch points.')
  }
  return source
    .replace(mux, 'return this.readSse(MUX_EVENTS_PATH, signal, muxFrameSchema, onOpen);')
    .replace(host, 'return this.readSse(HOST_EVENTS_PATH, signal, hostFrameSchema, onOpen);')
}

function patchSettingsBundle(source) {
  return mustReplace(
    source,
    'const controller = new SettingsScopeController(connection.api, spec, connection.isLoopback ? "host" : "memory");',
    'const controller = new SettingsScopeController(connection.api, spec, "host");',
    'settings host persistence',
  )
}

function patchSettingsModelsBundle(source) {
  let next = mustReplace(
    source,
    'const welcomeController = new WelcomeNoticeStore(connection.api, connection.isLoopback ? "host" : "memory");',
    'const welcomeController = new WelcomeNoticeStore(connection.api, "host");',
    'models welcome host persistence',
  )
  next = mustReplace(
    next,
    '			intro: "Enter your API keys to use models from the following providers.",',
    '			intro: "Enter your API keys to use models from the following providers.",\n			makersProvided: "Models are provided by EdgeOne Makers.",\n			learnMore: "Learn more",',
    'en makers models copy',
  )
  next = mustReplace(
    next,
    '			intro: "填入各提供方的 API 密钥即可使用其模型。",',
    '			intro: "填入各提供方的 API 密钥即可使用其模型。",\n			makersProvided: "模型由 EdgeOne Makers 提供。",\n			learnMore: "了解更多",',
    'zh makers models copy',
  )
  next = mustReplace(
    next,
    '.zGbnIq_candidateId{font-family:var(--ds-font-family-code);overflow-wrap:anywhere;flex:auto;font-size:13px}',
    '.zGbnIq_candidateId{font-family:var(--ds-font-family-code);overflow-wrap:anywhere;flex:auto;font-size:13px}.zGbnIq_docsLink{color:#3b63f6;font-size:14px;font-weight:600;line-height:22px;text-decoration:none;width:fit-content}.zGbnIq_docsLink:hover{text-decoration:underline}',
    'models docs link css',
  )
  next = mustReplace(
    next,
    '			"section": "zGbnIq_section",',
    '			"section": "zGbnIq_section",\n			"docsLink": "zGbnIq_docsLink",',
    'models docs link class',
  )
  next = mustReplace(
    next,
    `		function ModelsSection(props) {
			const { controller, useSnapshot, api, t } = props;
			if (controller === void 0 || useSnapshot === void 0 || api === void 0 || t === void 0) return null;
			return (0, react_jsx_runtime.jsx)(Loaded, { injected: {
				controller,
				useSnapshot,
				api,
				t
			} });
		}`,
    `		function ModelsSection(props) {
			const { t } = props;
			if (t === void 0) return null;
			const docs = location.hostname.endsWith(".edgeone.dev") ? "https://pages.edgeone.ai/document/models" : "https://cloud.tencent.com/document/product/1552/132748";
			return (0, react_jsx_runtime.jsxs)("div", {
				className: ModelsSection_module_css_default["section"],
				children: [
					(0, react_jsx_runtime.jsx)("h2", {
						className: ModelsSection_module_css_default["title"],
						children: t("title")
					}),
					(0, react_jsx_runtime.jsx)("p", {
						className: ModelsSection_module_css_default["intro"],
						children: t("makersProvided")
					}),
					(0, react_jsx_runtime.jsx)("a", {
						className: ModelsSection_module_css_default["docsLink"],
						href: docs,
						target: "_blank",
						rel: "noopener noreferrer",
						children: t("learnMore")
					})
				]
			});
		}`,
    'models section makers copy',
  )
  next = mustReplace(
    next,
    `			ctx.slots.inject("settings.onboarding", () => ctx.slots.register({
				name: "settings.onboarding",
				id: "welcome-notice",
				order: -100,
				inject: welcomeInjected
			}, WelcomeNotice));
`,
    '',
    'welcome notice onboarding slot',
  )
  return mustReplace(
    next,
    `			ctx.slots.inject("settings.onboarding", () => ctx.slots.register({
				name: "settings.onboarding",
				id: "deepseek-official",
				order: 0,
				inject: deepSeekOnboardingInjected
			}, DeepSeekOnboardingDialog));
`,
    '',
    'deepseek official onboarding slot',
  )
}

function patchModelSelectionBundle(source) {
  let next = mustReplace(
    source,
    '			generation = 0;\n			disposed = false;',
    '			generation = 0;\n			inflightSelect = 0;\n			disposed = false;',
    'model select inflight flag',
  )
  next = mustReplace(
    next,
    `			async load() {
				this.assertAvailable();
				const generation = ++this.generation;
				this.store.update((s) => {
					s.status = "loading";
					s.error = null;
				});`,
    `			async load() {
				this.assertAvailable();
				const generation = ++this.generation;
				const hadCatalog = this.store.getSnapshot().groups.length > 0;
				this.store.update((s) => {
					if (!hadCatalog) s.status = "loading";
					s.error = null;
				});`,
    'model catalog silent refresh',
  )
  next = mustReplace(
    next,
    `				const { result } = await this.sessions.models({ sessionId: this.sessionId });
				if (this.disposed || generation !== this.generation) {
					if (!result.ok) throw new Error(\`\${result.error.code}: \${result.error.message}\`);
					return result.value;
				}
				if (!result.ok) {
					this.store.update((s) => {
						s.status = "error";
						s.error = \`\${result.error.code}: \${result.error.message}\`;
					});
					throw new Error(\`session.models failed: \${result.error.code}: \${result.error.message}\`);
				}
				const { current, routable, groups, failures } = result.value;
				this.store.update((s) => {
					s.current = current;
					s.routable = routable;
					s.groups = groups;
					s.failures = failures;
					s.status = "ready";
					s.error = null;
				});
				return result.value;`,
    `				const { result } = await this.sessions.models({ sessionId: this.sessionId });
				if (this.disposed || generation !== this.generation) {
					if (!result.ok) throw new Error(\`\${result.error.code}: \${result.error.message}\`);
					return { ...result.value, groups: result.value.groups.filter((group) => group.id === "edgeone-makers") };
				}
				if (!result.ok) {
					this.store.update((s) => {
						s.status = "error";
						s.error = \`\${result.error.code}: \${result.error.message}\`;
					});
					throw new Error(\`session.models failed: \${result.error.code}: \${result.error.message}\`);
				}
				const { current, routable, groups, failures } = result.value;
				const makersGroups = groups.filter((group) => group.id === "edgeone-makers");
				this.store.update((s) => {
					if (this.inflightSelect === 0) s.current = current;
					s.routable = routable;
					s.groups = makersGroups;
					s.failures = failures;
					s.status = "ready";
					s.error = null;
				});
				return { ...result.value, groups: makersGroups };`,
    'keep only EdgeOne Makers models',
  )
  next = mustReplace(
    next,
    `			async select(selection) {
				this.assertAvailable();
				const generation = ++this.generation;
				this.store.update((s) => {
					s.status = "selecting";
					s.error = null;
				});
				const { result } = await this.sessions.selectModel({
					sessionId: this.sessionId,
					provider: selection.provider,
					model: selection.model,
					...selection.reasoningEffort === void 0 ? {} : { reasoningEffort: selection.reasoningEffort }
				});
				if (this.disposed || generation !== this.generation) {
					if (!result.ok) throw new Error(\`\${result.error.code}: \${result.error.message}\`);
					return;
				}
				if (!result.ok) {
					this.store.update((s) => {
						s.status = "error";
						s.error = \`\${result.error.code}: \${result.error.message}\`;
					});
					throw new Error(\`session.selectModel failed: \${result.error.code}: \${result.error.message}\`);
				}
				this.store.update((s) => {
					s.current = result.value.selected;
					s.routable = true;
					s.status = "ready";
					s.error = null;
				});
			}`,
    `			async select(selection) {
				this.assertAvailable();
				const generation = ++this.generation;
				const previous = this.store.getSnapshot().current;
				const optimistic = {
					provider: selection.provider,
					model: selection.model,
					...selection.reasoningEffort === void 0 ? {} : { reasoningEffort: selection.reasoningEffort }
				};
				this.inflightSelect++;
				this.store.update((s) => {
					s.current = optimistic;
					s.routable = true;
					s.status = "ready";
					s.error = null;
				});
				try {
					const { result } = await this.sessions.selectModel({
						sessionId: this.sessionId,
						provider: selection.provider,
						model: selection.model,
						...selection.reasoningEffort === void 0 ? {} : { reasoningEffort: selection.reasoningEffort }
					});
					if (this.disposed || generation !== this.generation) {
						if (!result.ok) throw new Error(\`\${result.error.code}: \${result.error.message}\`);
						return;
					}
					if (!result.ok) throw new Error(\`session.selectModel failed: \${result.error.code}: \${result.error.message}\`);
					this.store.update((s) => {
						s.current = result.value.selected;
						s.routable = true;
						s.status = "ready";
						s.error = null;
					});
				} catch (error) {
					if (!this.disposed && generation === this.generation) {
						this.store.update((s) => {
							s.current = previous;
							s.status = "error";
							s.error = error instanceof Error ? error.message : String(error);
						});
					}
					throw error;
				} finally {
					this.inflightSelect--;
				}
			}`,
    'optimistic model select',
  )
  next = mustReplace(
    next,
    `			const settleSelection = (accepted) => {
				if (accepted) {
					if (rootRef.current !== null) close(true);
					return;
				}`,
    `			const settleSelection = (accepted) => {
				if (accepted) return;`,
    'do not close menu after in-flight select',
  )
  next = mustReplace(
    next,
    `			const choose = (selection) => {
				if (state.current?.provider === selection.provider && state.current.model === selection.model) {
					close(true);
					return;
				}
				lastActionRef.current = "select";
				select(selection).then(settleSelection);
			};`,
    `			const choose = (selection) => {
				if (state.current?.provider === selection.provider && state.current.model === selection.model) {
					close(true);
					return;
				}
				lastActionRef.current = "select";
				close(true);
				select(selection).then(settleSelection);
			};`,
    'close model menu immediately',
  )
  next = mustReplace(
    next,
    `				lastActionRef.current = "select";
				select(selection).then(settleSelection);
			};
			const modelLabel`,
    `				lastActionRef.current = "select";
				close(true);
				select(selection).then(settleSelection);
			};
			const modelLabel`,
    'close effort menu immediately',
  )
  next = mustReplace(
    next,
    `			const show = () => {
				setPane("root");
				setOpen(true);
				reload();
			};`,
    `			const show = () => {
				setPane("root");
				setOpen(true);
				if (state.groups.length === 0) reload();
				else load();
			};`,
    'reuse cached model catalog',
  )
  return next
}

function patchAgentPresetBundle(source) {
  let next = source
  next = mustReplace(
    next,
    '			presetCordisDescription: "Built for creating custom agent presets, with all Standard mode capabilities plus runtime inspection, plugin experiments, and preset-authoring guidance.",\n			duplicate: "Duplicate",',
    '			presetCordisDescription: "Built for creating custom agent presets, with all Standard mode capabilities plus runtime inspection, plugin experiments, and preset-authoring guidance.",\n			presetMakersName: "Makers mode",\n			presetMakersDescription: "A DSH Agent that uses EdgeOne Makers MCP tools, Sandbox, and AI Gateway.",\n			presetUnavailable: "This mode cannot be selected on EdgeOne Makers",\n			duplicate: "Duplicate",',
    'en locale',
  )
  next = mustReplace(
    next,
    '			presetCordisDescription: "用于创建自定义 Agent preset：具备标准模式的全部能力，并提供运行时检查、插件实验和 preset 创作指导。",\n			duplicate: "复制",',
    '			presetCordisDescription: "用于创建自定义 Agent preset：具备标准模式的全部能力，并提供运行时检查、插件实验和 preset 创作指导。",\n			presetMakersName: "Makers 模式",\n			presetMakersDescription: "使用 EdgeOne Makers MCP 工具、Sandbox 与 AI Gateway 的 DSH Agent。",\n			presetUnavailable: "该模式在 EdgeOne Makers 上不可选择",\n			duplicate: "复制",',
    'zh locale',
  )
  next = mustReplace(
    next,
    `		};
		/**
		* Resolve preset display copy without making user-authored metadata translatable.`,
    `		};
		function isLockedBuiltInPreset(id) {
			return Object.prototype.hasOwnProperty.call(BUILT_IN_PRESET_KEYS, id);
		}
		/**
		* Resolve preset display copy without making user-authored metadata translatable.`,
    'lock helper',
  )
  next = mustReplace(
    next,
    `		function presetDisplayText(preset, t) {
			const keys = preset.trust === "system" ? BUILT_IN_PRESET_KEYS[preset.id] : void 0;`,
    `		function presetDisplayText(preset, t) {
			const keys = preset.id === "makers" ? {
				name: "presetMakersName",
				description: "presetMakersDescription"
			} : preset.trust === "system" ? BUILT_IN_PRESET_KEYS[preset.id] : void 0;`,
    'makers preset i18n',
  )
  next = mustReplace(
    next,
    `				items: options.map((option) => {
					const name = presetDisplayText(option, t).name;
					return {
						id: option.id,
						label: option.trust === "user" ? \`\${name} · \${t("userTrust")}\` : name
					};
				}),
				selectedId,
				onSelect: (id) => {
					onOpenChange(false);
					onSelect(id);
				},`,
    `				items: options.map((option) => {
					const name = presetDisplayText(option, t).name;
					const locked = isLockedBuiltInPreset(option.id);
					const text = option.trust === "user" ? \`\${name} · \${t("userTrust")}\` : name;
					return {
						id: option.id,
						label: locked ? (0, react_jsx_runtime.jsx)("span", {
							className: "dsh-makers-tip dsh-makers-locked",
							"data-tip": t("presetUnavailable"),
							children: text
						}) : text
					};
				}),
				selectedId,
				onSelect: (id) => {
					if (isLockedBuiltInPreset(id)) return;
					onOpenChange(false);
					onSelect(id);
				},`,
    'settings menu items',
  )
  next = mustReplace(
    next,
    `				items: state.options.map((option) => {
					const text = presetDisplayText(option, t);
					return {
						id: option.id,
						label: (0, react_jsx_runtime.jsxs)("span", {
							className: AgentPresetSeat_module_css_default.item,`,
    `				items: state.options.map((option) => {
					const text = presetDisplayText(option, t);
					const locked = isLockedBuiltInPreset(option.id);
					return {
						id: option.id,
						label: (0, react_jsx_runtime.jsxs)("span", {
							className: locked ? \`\${AgentPresetSeat_module_css_default.item} dsh-makers-tip dsh-makers-locked\` : AgentPresetSeat_module_css_default.item,
							"data-tip": locked ? t("presetUnavailable") : void 0,`,
    'seat menu items',
  )
  next = mustReplace(
    next,
    `				onSelect: (id) => {
					setOpen(false);
					select(id);
				},`,
    `				onSelect: (id) => {
					if (isLockedBuiltInPreset(id)) return;
					setOpen(false);
					select(id);
				},`,
    'seat menu select',
  )
  next = mustReplace(
    next,
    `			async select(id) {
				const before = this.store.getSnapshot();
				if (before.status === "saving" || id === before.currentValue) return;`,
    `			async select(id) {
				if (isLockedBuiltInPreset(id)) return;
				const before = this.store.getSnapshot();
				if (before.status === "saving" || id === before.currentValue) return;`,
    'settings select guard',
  )
  next = mustReplace(
    next,
    `			async makeDefault(id) {
				const failure = await writeDefaultPreset(this.api, id);`,
    `			async makeDefault(id) {
				if (isLockedBuiltInPreset(id)) return;
				const failure = await writeDefaultPreset(this.api, id);`,
    'makeDefault guard',
  )
  next = mustReplace(
    next,
    '.rtSEdW_card:hover:not(.rtSEdW_cardActive){border-color:var(--dsw-alias-label-dimmed)}',
    '.rtSEdW_card:hover:not(.rtSEdW_cardActive):not([data-locked=true]){border-color:var(--dsw-alias-label-dimmed)}.rtSEdW_card[data-locked=true]{opacity:.45;filter:grayscale(.2);cursor:not-allowed}',
    'locked card css',
  )
  next = mustReplace(
    next,
    `			const creatorButton = props.startCreatorDraft !== void 0 && state.rows.some((row) => row.id === "cordis") ? (0, react_jsx_runtime.jsxs)("button", {
				type: "button",
				className: AgentPresetSection_module_css_default.creatorButton,
				disabled: !state.authorable,
				title: state.authorable ? void 0 : t("duplicateUnavailable"),
				onClick: () => {
					props.startCreatorDraft?.();
					props.close();
				},
				children: [(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconPlusOutline16, { size: 14 }), t("creatorDraft")]
			}) : null;`,
    `			const creatorButton = props.startCreatorDraft !== void 0 && state.rows.some((row) => row.id === "cordis") ? (0, react_jsx_runtime.jsx)("span", {
				className: "dsh-makers-tip",
				"data-tip": t("presetUnavailable"),
				children: (0, react_jsx_runtime.jsxs)("button", {
					type: "button",
					className: AgentPresetSection_module_css_default.creatorButton,
					disabled: true,
					children: [(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconPlusOutline16, { size: 14 }), t("creatorDraft")]
				})
			}) : null;`,
    'creator draft button',
  )
  next = mustReplace(
    next,
    `									children: group.map(({ row, text }) => (0, react_jsx_runtime.jsxs)("li", {
										className: row.broken !== void 0 ? \`\${AgentPresetSection_module_css_default.card} \${AgentPresetSection_module_css_default.cardBroken}\` : row.isDefault ? \`\${AgentPresetSection_module_css_default.card} \${AgentPresetSection_module_css_default.cardActive}\` : AgentPresetSection_module_css_default.card,
										children: [
											(0, react_jsx_runtime.jsxs)("button", {
												type: "button",
												className: AgentPresetSection_module_css_default.cardMain,
												"aria-pressed": row.isDefault,
												disabled: row.isDefault || row.broken !== void 0,
												"aria-label": \`\${row.broken !== void 0 ? t("brokenBadge") : row.isDefault ? t("inUse") : t("setDefault")}: \${text.name}\`,
												title: row.broken ?? (row.isDefault ? t("inUse") : t("setDefault")),`,
    `									children: group.map(({ row, text }) => (0, react_jsx_runtime.jsxs)("li", {
										className: row.broken !== void 0 ? \`\${AgentPresetSection_module_css_default.card} \${AgentPresetSection_module_css_default.cardBroken}\` : row.isDefault ? \`\${AgentPresetSection_module_css_default.card} \${AgentPresetSection_module_css_default.cardActive}\` : AgentPresetSection_module_css_default.card,
										"data-locked": isLockedBuiltInPreset(row.id) ? "true" : void 0,
										"data-tip": isLockedBuiltInPreset(row.id) ? t("presetUnavailable") : void 0,
										children: [
											(0, react_jsx_runtime.jsxs)("button", {
												type: "button",
												className: AgentPresetSection_module_css_default.cardMain,
												"aria-pressed": row.isDefault,
												disabled: isLockedBuiltInPreset(row.id) || row.isDefault || row.broken !== void 0,
												"aria-label": \`\${isLockedBuiltInPreset(row.id) ? t("presetUnavailable") : row.broken !== void 0 ? t("brokenBadge") : row.isDefault ? t("inUse") : t("setDefault")}: \${text.name}\`,
												title: isLockedBuiltInPreset(row.id) ? t("presetUnavailable") : row.broken ?? (row.isDefault ? t("inUse") : t("setDefault")),`,
    'settings cards',
  )
  next = mustReplace(
    next,
    `			async select(id) {
				if (this.store.getSnapshot().busy) return;
				this.stage(id);
				await this.apply();
			}`,
    `			async select(id) {
				if (isLockedBuiltInPreset(id) || this.store.getSnapshot().busy) return;
				this.stage(id);
				await this.apply();
			}`,
    'seat select guard',
  )
  next = mustReplace(
    next,
    `			stage(id, introduce = false) {
				this.staged = id;`,
    `			stage(id, introduce = false) {
				if (isLockedBuiltInPreset(id)) return;
				this.staged = id;`,
    'seat stage guard',
  )
  next = mustReplace(
    next,
    `					const chip = scope.slots.register({
						name: "conversation.hero.agentPreset",
						locale: "settings.agentPreset",
						inject: seatInjected
					}, AgentPresetSeat);
					const label = scope.slots.register({
						name: "conversation.session.header.actions",
						id: "agent-preset",
						order: -10,
						locale: "settings.agentPreset",
						inject: labelInjected
					}, AgentPresetLabel);
`,
    `					const chip = () => {};
					const label = () => {};
`,
    'hide agent preset seat and header label',
  )
  next = mustReplace(
    next,
    `			ctx.slots.inject("settings.general.item", () => ctx.slots.register({
				name: "settings.general.item",
				id: "agent-preset",
				order: -25,
				locale: "settings.agentPreset",
				inject: injected
			}, AgentPresetRow));
			ctx.slots.inject("settings.section", () => ctx.slots.register({
				name: "settings.section",
				id: "agent-presets",
				order: 20,
				label: () => ctx.locale.bind("settings.agentPreset")("nav"),
				locale: "settings.agentPreset",
				inject: sectionInjected
			}, AgentPresetSection));
`,
    '',
    'hide agent preset settings',
  )
  return next
}

function patchPermissionPresetsBundle(source) {
  let next = mustReplace(
    source,
    '			"description": "选择新会话的默认权限模式",',
    '			"description": "选择新会话在 EdgeOne Makers 沙箱中的默认权限：只读、读写文件，或包含命令与预览的 Full access",',
    'settings permission zh description',
  )
  next = mustReplace(
    next,
    '			"description": "Choose the default permission mode for new sessions",',
    '			"description": "Choose the default Makers sandbox permission for new sessions: read-only, file write, or Full access with commands and preview",',
    'settings permission en description',
  )
  next = mustReplace(
    next,
    '			"confirm.description": "启用 Full access 后，新会话将减少确认步骤，并且可以直接执行更多操作，包括敏感操作、文件修改或外部命令。仅建议在你信任后续任务时使用。",',
    '			"confirm.description": "启用 Full access 后，新会话可以在 EdgeOne Makers 沙箱中直接运行命令并发布预览，且不再弹出确认。仍然无法访问你的本机。仅建议在你信任后续任务时使用。",',
    'settings full access zh confirm',
  )
  next = mustReplace(
    next,
    '			"confirm.description": "Full access lets new sessions reduce confirmation steps and perform more actions directly, including sensitive operations, file changes, or external commands. Only use it when you trust subsequent tasks.",',
    '			"confirm.description": "Full access lets new sessions run commands and publish previews in the EdgeOne Makers sandbox without extra confirmation. The local machine is still never accessible. Only use it when you trust subsequent tasks.",',
    'settings full access en confirm',
  )
  next = mustReplace(
    next,
    '			"confirm.description": "启用 Full access 后，agent 将减少确认步骤，并且可以直接执行更多操作，包括敏感操作、文件修改或外部命令。仅建议在你信任当前任务时使用。",',
    '			"confirm.description": "启用 Full access 后，agent 可以在 EdgeOne Makers 沙箱中直接运行命令并发布预览，且不再弹出确认。仍然无法访问你的本机。仅建议在你信任当前任务时使用。",',
    'session full access zh confirm',
  )
  return mustReplace(
    next,
    '			"confirm.description": "Full access reduces confirmation steps and lets the agent perform more actions directly, including sensitive operations, file changes, or external commands. Only use it when you trust the current task.",',
    '			"confirm.description": "Full access lets the agent run commands and publish previews in the EdgeOne Makers sandbox without extra confirmation. The local machine is still never accessible. Only use it when you trust the current task.",',
    'session full access en confirm',
  )
}

function patchConversationBundle(source) {
  let next = source
  next = mustReplace(
    next,
    '			"access.confirm.description": "启用 Full access 后，agent 将减少确认步骤，并且可以直接执行更多操作，包括敏感操作、文件修改或外部命令。仅建议在你信任当前任务时使用。",',
    '			"access.confirm.description": "启用 Full access 后，agent 可以在 EdgeOne Makers 沙箱中直接运行命令并发布预览，且不再弹出确认。仍然无法访问你的本机。仅建议在你信任当前任务时使用。",\n			"access.read-only.detail": "只能查看 EdgeOne Makers 沙箱：列出和读取文件。写入、运行命令或发布预览时会询问你确认。",\n			"access.workspace-write.detail": "可在 EdgeOne Makers 沙箱中读写文件。运行命令和发布预览时会询问你确认。",\n			"access.danger-full-access.detail": "开放全部 Makers 沙箱能力：文件、命令和预览，不再弹出确认。仍然无法访问本机。",',
    'conversation zh permission copy',
  )
  next = mustReplace(
    next,
    '			"access.confirm.description": "Full access reduces confirmation steps and lets the agent perform more actions directly, including sensitive operations, file changes, or external commands. Only use it when you trust the current task.",',
    '			"access.confirm.description": "Full access lets the agent run commands and publish previews in the EdgeOne Makers sandbox without extra confirmation. The local machine is still never accessible. Only use it when you trust the current task.",\n			"access.read-only.detail": "Inspect the EdgeOne Makers sandbox: list and read files. Writes, commands, and preview will ask you to confirm.",\n			"access.workspace-write.detail": "Read and write files in the EdgeOne Makers sandbox. Commands and preview will ask you to confirm.",\n			"access.danger-full-access.detail": "Full Makers sandbox access: files, commands, and preview, without extra confirmation. The local machine is still never accessible.",',
    'conversation en permission copy',
  )
  next = mustReplace(
    next,
    '					title: current?.description,',
    '					title: ["read-only", "workspace-write", "danger-full-access"].includes(currentValue) ? t(`access.${currentValue}.detail`) : current?.description,',
    'permission option makers tooltip',
  )
  next = mustReplace(
    next,
    '			"hero.chooseWorkspace": "选择工作区",',
    '			"hero.chooseWorkspace": "选择工作区",\n			"hero.cloudWorkspace": "云端工作区",',
    'conversation zh locale',
  )
  next = mustReplace(
    next,
    '			"hero.chooseWorkspace": "Choose workspace",',
    '			"hero.chooseWorkspace": "Choose workspace",\n			"hero.cloudWorkspace": "Cloud Workspace",',
    'conversation en locale',
  )
  next = mustReplace(
    next,
    '.pXSMma_workspace{max-width:min(100%,360px);min-height:28px;color:var(--dsw-alias-label-primary);cursor:pointer;background:0 0;border:none;border-radius:16px;align-items:center;gap:4px;padding:0 8px;font-size:13px;font-weight:500;line-height:20px;display:inline-flex}.pXSMma_workspace:not(:disabled):hover,.pXSMma_workspace[aria-expanded=true]{background:var(--dsw-alias-interactive-bg-hover)}.pXSMma_workspace:disabled{cursor:default}',
    '.pXSMma_workspace{max-width:min(100%,360px);min-height:28px;color:var(--dsw-alias-label-primary);cursor:default;background:0 0;border:none;border-radius:16px;align-items:center;gap:4px;padding:0 8px;font-size:13px;font-weight:500;line-height:20px;display:inline-flex}',
    'workspace chip static css',
  )
  next = mustReplace(
    next,
    `		function WorkspaceChip({ buttonRef, label, menuOpen = false, onClick, t }) {
			return (0, react_jsx_runtime.jsxs)("button", {
				ref: buttonRef,
				type: "button",
				className: HeroShell_module_css_default.workspace,
				"aria-label": t("hero.chooseWorkspace"),
				"aria-haspopup": "menu",
				"aria-expanded": menuOpen,
				onClick,
				children: [
					label === void 0 ? (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconFolderClose16, {
						className: HeroShell_module_css_default.folder,
						size: 16
					}) : (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconFolderOpen16, {
						className: HeroShell_module_css_default.folder,
						size: 16
					}),
					(0, react_jsx_runtime.jsx)("span", {
						className: HeroShell_module_css_default.workspaceLabel,
						children: label ?? t("hero.chooseWorkspace")
					}),
					(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconChevronDownOutline14, {
						className: HeroShell_module_css_default.chevron,
						size: 12
					})
				]
			});
		}`,
    `		function WorkspaceChip({ buttonRef, label, menuOpen = false, onClick, t }) {
			return (0, react_jsx_runtime.jsxs)("span", {
				ref: buttonRef,
				className: HeroShell_module_css_default.workspace,
				"aria-label": t("hero.cloudWorkspace"),
				children: [
					(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconFolderOpen16, {
						className: HeroShell_module_css_default.folder,
						size: 16
					}),
					(0, react_jsx_runtime.jsx)("span", {
						className: HeroShell_module_css_default.workspaceLabel,
						children: t("hero.cloudWorkspace")
					})
				]
			});
		}`,
    'workspace chip static',
  )
  next = mustReplace(
    next,
    `					(0, react_jsx_runtime.jsx)(WorkspaceChip, {
						buttonRef: pickerAnchor,
						label: chipTitle,
						menuOpen: pickerOpen,
						onClick: () => {
							setPickerOpen((open) => !open);
						},
						t
					}),`,
    `					(0, react_jsx_runtime.jsx)(WorkspaceChip, {
						buttonRef: pickerAnchor,
						label: chipTitle,
						menuOpen: false,
						onClick: () => {},
						t
					}),`,
    'workspace chip click',
  )
  return next
}

function patchWorkspaceBundle(source) {
  let next = source
  next = mustReplace(
    next,
    '			"section.workspaces": "工作区",',
    '			"section.workspaces": "云端工作区",',
    'workspace zh section',
  )
  next = mustReplace(
    next,
    '			"section.workspaces": "Workspaces",',
    '			"section.workspaces": "Cloud Workspace",',
    'workspace en section',
  )
  next = mustReplace(
    next,
    `					expanded,
					containsCurrent: g.key === currentGroup,
					sessions: expanded ? g.sessions.map((session) => sessionNode(session, descendants)) : []`,
    `					expanded: true,
					containsCurrent: g.key === currentGroup,
					sessions: g.sessions.map((session) => sessionNode(session, descendants))`,
    'always expand workspace groups',
  )
  next = mustReplace(
    next,
    `								children: [
									(0, react_jsx_runtime.jsx)(ProjectRowItem, {
										group,
										t,
										onToggle: () => {
											if (group.expanded) setExpandedSessionGroups((keys) => keys.filter((key) => key !== group.key));
											setGroupExpanded(group.key, !group.expanded);
										},
										onCreate: () => {
											if (group.workspaceId !== void 0) {
												setGroupExpanded(group.key, true);
												startSession(group.workspaceId);
											}
										},
										drag: workspaceDragProps,
										actions: group.workspaceId === void 0 ? void 0 : {
											rename: () => {
												/* v8 ignore next -- narrowing guard: the actions object exists only for real-workspace groups. */
												if (group.workspaceId !== void 0) onRenameRequest(group.workspaceId, group.label);
											},
											delete: () => {
												/* v8 ignore next -- narrowing guard: the actions object exists only for real-workspace groups. */
												if (group.workspaceId !== void 0) onDeleteRequest(group.workspaceId, group.label);
											}
										}
									}),
									(expandedSessionGroups.includes(group.key) ? group.sessions : group.sessions.slice(0, COLLAPSED_SESSION_LIMIT)).map((node) => {`,
    `								children: [
									(expandedSessionGroups.includes(group.key) ? group.sessions : group.sessions.slice(0, COLLAPSED_SESSION_LIMIT)).map((node) => {`,
    'hide workspace project row',
  )
  next = mustReplace(
    next,
    `								}), directoryFlowAvailable && (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Tooltip, {
									label: t("workspace.add"),
									side: "bottom",
									delayMs: 500,
									children: (0, react_jsx_runtime.jsx)("button", {
										ref: wsPlusRef,
										type: "button",
										className: WorkspaceBrowser_module_css_default.iconButton,
										"aria-label": t("workspace.add"),
										onClick: () => {
											setWsPickerOpen((v) => !v);
										},
										children: (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconProjectAddOutline16, { size: wide ? 16 : 18 })
									})
								})]`,
    `								})]`,
    'workspace add button',
  )
  next = mustReplace(
    next,
    `				children: [
					(0, react_jsx_runtime.jsxs)("div", {
						className: WorkspaceBrowser_module_css_default.sectionHeader,`,
    `				children: [
					wide && (0, react_jsx_runtime.jsxs)("div", {
						className: WorkspaceBrowser_module_css_default.sectionHeader,`,
    'hide empty rail section header',
  )
  return next
}

function patchLocaleBundle(source) {
  let next = mustReplace(
    source,
    `			publish(active, localeChanged) {
				this.snapshot = Object.freeze({
					active,
					locales: this.snapshot.locales,
					revision: this.snapshot.revision + 1
				});
				if (localeChanged) this.ctx.emit("locale/change", this.snapshot);`,
    `			publish(active, localeChanged) {
				this.snapshot = Object.freeze({
					active,
					locales: this.snapshot.locales,
					revision: this.snapshot.revision + 1
				});
				if (typeof document !== "undefined") document.documentElement.lang = active === "en" ? "en" : "zh-CN";
				if (localeChanged) this.ctx.emit("locale/change", this.snapshot);`,
    'sync html lang',
  )
  return mustReplace(
    next,
    `		/**
		* The browser's own language wins over {@link FALLBACK_LOCALE}; an explicit
		* Host preference may replace this provisional value after plugin activation.
		*/
		function resolveInitialLocale() {
			return detectBrowserLocale() ?? "zh";
		}
		/**
		* The first shipped locale the browser asks for, matched on the primary
		* subtag so every regional variant lands on its language (\`zh-Hans-CN\` -> zh,
		* \`en-GB\` -> en). \`window\` is the browser test, not \`navigator\`: Node exposes
		* a global \`navigator\` reporting the machine's own language, which would
		* otherwise decide the locale for non-browser runs (node e2e booting the
		* client tree). \`navigator.language\` trails the ordered \`languages\` list and
		* covers its absence on hosts that expose only the single tag.
		*/
		function detectBrowserLocale() {
			if (typeof window === "undefined") return void 0;
			for (const tag of [...navigator.languages ?? [], navigator.language]) {
				const primary = tag.toLowerCase().split("-")[0];
				const match = LOCALES.find((locale) => locale.id === primary);
				if (match) return match.id;
			}
		}`,
    `		/**
		* Hostname wins over {@link FALLBACK_LOCALE}: \`.edgeone.dev\` is English, all
		* other hosts are Chinese. An explicit Host preference may replace this
		* provisional value after plugin activation.
		*/
		function resolveInitialLocale() {
			if (typeof window !== "undefined" && location.hostname.endsWith(".edgeone.dev")) return "en";
			return "zh";
		}`,
    'hostname default locale',
  )
}

function patchSessionLogExportBundle(source) {
  return mustReplace(
    source,
    `					const response = await this.fetcher(url, {
						method: "HEAD",
						signal
					});
					if (!response.ok) {
						const detail = await response.text().catch(() => "");
						throw new Error(\`Export failed: HTTP \${response.status}\${detail === "" ? "" : \` \${detail}\`}\`);
					}
					this.save(url.toString(), sessionLogZipFilename(sessionId));`,
    `					const response = await this.fetcher(url, {
						method: "GET",
						signal
					});
					if (!response.ok) {
						const detail = await response.text().catch(() => "");
						throw new Error(\`Export failed: HTTP \${response.status}\${detail === "" ? "" : \` \${detail}\`}\`);
					}
					const blob = await response.blob();
					if (this.disposed || signal.aborted) return;
					const objectUrl = URL.createObjectURL(blob);
					this.save(objectUrl, sessionLogZipFilename(sessionId));
					setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);`,
    'session log blob download',
  )
}

async function preparePqgModuleSettingsClient() {
  const entry = join(root, 'src', 'pqg-module-settings-client.ts')
  const source = await readFile(entry, 'utf8')
  const transformed = await transformWithEsbuild(source, entry, {
    loader: 'ts',
    target: 'es2022',
    format: 'cjs',
    sourcemap: false,
    charset: 'utf8',
  })
  const bundled = [
    `window.__ModuleLoader__.load({ id: ${JSON.stringify(pqgModuleSettingsId)}, factory: (require) => { var module = { exports: {} }; var exports = module.exports;`,
    transformed.code.trimEnd(),
    'return module.exports; } });',
    '',
  ].join('\n')
  const target = join(publicDir, 'plugins', ...pqgModuleSettingsId.split('/'), 'client.js')
  await mkdir(dirname(target), { recursive: true })
  await writeFile(target, bundled)
  const rev = hash(bundled)
  return {
    id: pqgModuleSettingsId,
    url: `/plugins/${pqgModuleSettingsId}/client.js?rev=${rev}`,
    rev,
    inject: [
      '@deepseek-ai/dsh-client-runtime',
      '@deepseek-ai/dsh-client-ui-settings',
      '@deepseek-ai/dsh-client-ui-slots',
    ],
  }
}

async function clientPackages() {
  const rows = []
  for (const directory of await readdir(modulesRoot)) {
    const packageDir = join(modulesRoot, directory)
    let manifest
    try { manifest = JSON.parse(await readFile(join(packageDir, 'package.json'), 'utf8')) } catch { continue }
    const client = manifest.dsh?.client
    if (client?.platform !== 'web' || excluded.has(manifest.name)) continue
    let source
    try { source = await readFile(join(packageDir, 'lib', 'client.js'), 'utf8') } catch { continue }
    if (manifest.name === '@deepseek-ai/dsh-client-connection') source = patchConnectionBundle(source)
    if (manifest.name === '@deepseek-ai/dsh-client-ui-agent-preset') source = patchAgentPresetBundle(source)
    if (manifest.name === '@deepseek-ai/dsh-client-ui-permission-presets') source = patchPermissionPresetsBundle(source)
    if (manifest.name === '@deepseek-ai/dsh-client-ui-conversation') source = patchConversationBundle(source)
    if (manifest.name === '@deepseek-ai/dsh-client-ui-workspace') source = patchWorkspaceBundle(source)
    if (manifest.name === '@deepseek-ai/dsh-client-ui-settings') source = patchSettingsBundle(source)
    if (manifest.name === '@deepseek-ai/dsh-client-ui-settings-models') source = patchSettingsModelsBundle(source)
    if (manifest.name === '@deepseek-ai/dsh-client-ui-model-selection') source = patchModelSelectionBundle(source)
    if (manifest.name === '@deepseek-ai/dsh-session-log-export') source = patchSessionLogExportBundle(source)
    if (manifest.name === '@deepseek-ai/dsh-client-locale') source = patchLocaleBundle(source)
    const target = join(publicDir, 'plugins', ...manifest.name.split('/'), 'client.js')
    await mkdir(dirname(target), { recursive: true })
    await writeFile(target, source)
    const rev = hash(source)
    rows.push({
      id: manifest.name,
      url: `/plugins/${manifest.name}/client.js?rev=${rev}`,
      rev,
      inject: Array.isArray(client.inject) ? client.inject : [],
      ...(client.immediately === true ? { immediately: true } : {}),
    })
  }
  return rows.sort((left, right) => left.id.localeCompare(right.id))
}

const makersActionsHead = [
  '<!-- dsh-makers-actions -->',
  '<style>',
  '[class*="_centerCol"]{position:relative;container:dsh-center / inline-size}',
  '[class*="_titleRow"]{position:relative}',
  '[class*="_composerHero"]{z-index:5}',
  '#dsh-makers-chrome{position:absolute;top:0;right:0;left:0;z-index:0;display:flex;align-items:center;justify-content:flex-end;box-sizing:border-box;height:50px;padding:8px 16px;pointer-events:none}',
  '#dsh-makers-chrome>*{pointer-events:auto}',
  '#dsh-makers-actions{position:relative;z-index:0;display:flex;align-items:center;gap:2px;margin:0;padding:0;border:none;background:transparent;font-family:inherit;flex:none}',
  '#dsh-makers-actions[data-docked=true]{position:static}',
  '#dsh-makers-actions a{display:inline-flex;align-items:center;gap:7px;height:34px;padding:0 12px;border:none;border-radius:9px;color:#57606a;background:transparent;text-decoration:none;font:inherit;font-size:14px;font-weight:500;line-height:20px;white-space:nowrap;cursor:pointer;transition:background .16s,color .16s}',
  '#dsh-makers-actions a:hover{background:#f2f4f7;color:#1f2328}',
  '#dsh-makers-actions a:focus-visible{outline:2px solid var(--dsw-alias-brand-primary,#3964fe);outline-offset:1px}',
  '#dsh-makers-actions svg{flex:none}',
  '#dsh-makers-powered{position:absolute;top:10px;left:50%;z-index:0;display:inline-flex;align-items:center;gap:8px;height:28px;max-width:calc(100% - 2 * var(--dsh-makers-actions-width, 0px));padding:0 8px;border:none;border-radius:8px;background:transparent;color:#8b949e;font:inherit;font-size:12.5px;line-height:18px;white-space:nowrap;box-sizing:border-box;overflow:hidden;transform:translateX(-50%);pointer-events:auto}',
  '#dsh-makers-powered b{color:#5b6470;font-weight:600}',
  '#dsh-makers-powered[data-docked=true]{top:50%;transform:translate(-50%,-50%)}',
  '.dsh-makers-powered-divider{width:1px;height:12px;flex:none;background:#e8eaed}',
  '.dsh-makers-powered-more{display:inline-flex;align-items:center;gap:3px;flex:none;height:22px;padding:0 6px;border:none;border-radius:6px;background:transparent;color:#3b63f6;font:inherit;font-size:12.5px;font-weight:600;line-height:18px;white-space:nowrap;cursor:pointer;transition:background .16s}',
  '.dsh-makers-powered-more svg{flex:none;transition:transform .16s}',
  '.dsh-makers-powered-more:hover{background:rgba(59,99,246,.1)}',
  '.dsh-makers-powered-more:hover svg{transform:translateX(2px)}',
  '.dsh-makers-powered-more:focus-visible{outline:2px solid var(--dsw-alias-brand-primary,#3964fe);outline-offset:1px}',
  '#dsh-makers-powered[data-compact=true] .dsh-makers-powered-label,#dsh-makers-powered[data-compact=true] .dsh-makers-powered-divider,#dsh-makers-actions[data-compact=true] .dsh-makers-action-label{display:none}',
  '#dsh-makers-actions[data-compact=true] a{padding:0 8px}',
  '#dsh-makers-powered[data-compact=true]{padding:0 6px;gap:0}',
  '#dsh-makers-powered[data-hidden=true]{visibility:hidden;pointer-events:none}',
  '#dsh-makers-contact{position:fixed;inset:0;z-index:2147483646;display:grid;place-items:center;padding:20px}',
  '#dsh-makers-contact[hidden]{display:none!important}',
  '#dsh-makers-contact .dsh-makers-contact-overlay{position:absolute;inset:0;background:rgba(15,17,23,.42);backdrop-filter:blur(2px)}',
  '#dsh-makers-contact .dsh-makers-contact-card{position:relative;z-index:1;width:min(520px,calc(100vw - 40px));overflow:hidden;border-radius:16px;background:#fff;box-shadow:0 26px 70px rgba(17,18,22,.3);font-family:system-ui,-apple-system,sans-serif}',
  '#dsh-makers-contact .dsh-makers-contact-body{padding:22px 24px 24px}',
  '#dsh-makers-contact .dsh-makers-contact-icon{display:grid;width:42px;height:42px;place-items:center;margin-bottom:18px;border:1px solid #e8eaee;border-radius:10px;color:#17181c}',
  '#dsh-makers-contact .dsh-makers-contact-icon svg{width:22px;height:22px}',
  '#dsh-makers-contact h2{margin:0 0 8px;color:#17181c;font-size:20px;font-weight:700;letter-spacing:-.3px;line-height:1.35}',
  '#dsh-makers-contact p{margin:0;color:#6b7280;font-size:14px;line-height:1.7}',
  '#dsh-makers-contact .dsh-makers-contact-footer{display:flex;align-items:center;justify-content:space-between;gap:12px;box-sizing:border-box;padding:16px 24px;border-top:1px solid #e8eaee;background:#fafbfc}',
  '#dsh-makers-contact .dsh-makers-contact-footer button,#dsh-makers-contact .dsh-makers-contact-footer a{display:inline-flex;align-items:center;justify-content:center;height:40px;padding:0 18px;border-radius:9px;font-size:14px;font-weight:500;text-decoration:none;cursor:pointer}',
  '#dsh-makers-contact .dsh-makers-contact-later{border:1px solid #d6dae1;background:#fff;color:#17181c}',
  '#dsh-makers-contact .dsh-makers-contact-later:hover{border-color:#6b7280;background:#f7f8fa}',
  '#dsh-makers-contact .dsh-makers-contact-go{border:none;background:#3b5cff;color:#fff;font-weight:600}',
  '#dsh-makers-contact .dsh-makers-contact-go:hover{background:#2f4fe6}',
  '@container dsh-center (max-width:880px){#dsh-makers-actions .dsh-makers-action-label,#dsh-makers-powered .dsh-makers-powered-label,#dsh-makers-powered .dsh-makers-powered-divider{display:none}#dsh-makers-actions a{padding:0 8px}#dsh-makers-powered{padding:0 6px;gap:0}}',
  '@container dsh-center (max-width:360px){#dsh-makers-powered{visibility:hidden;pointer-events:none}}',
  '</style><script>',
  '(() => {',
  '  const intl = location.hostname.endsWith(".edgeone.dev");',
  '  document.documentElement.lang = intl ? "en" : "zh-CN";',
  '  const deployParams = "?template=deepseek-harness&from=within&fromAgent=1&agentLang=typescript";',
  '  const deployHref = intl ? "https://edgeone.ai/makers/new" + deployParams : "https://console.cloud.tencent.com/edgeone/makers/new" + deployParams;',
  '  const contactHref = intl ? "https://pages.edgeone.ai/contact?source=deepseek-harness" : "https://cloud.tencent.com/online-service?from=connect-us";',
  '  const copy = {',
  '    zh: { github: "GitHub 源码", deploy: "模版部署", powered: "基于 <b>EdgeOne Makers Agents</b> 部署", more: "了解更多", poweredTitle: "集成到我的产品", title: "从 DeepSeek Harness 到你的云端 Agent", body: "DeepSeek Harness 已接入 EdgeOne Makers Agents。部署后，你可以自由扩展模型、工具、技能与界面，打造适用于 Vibe Coding、任务自动化和内容生产的云端 Agent，并将生成的应用与内容发布至全球边缘网络。Makers 提供 Agent 托管、安全沙箱与应用交付的一体化方案。", later: "以后再说", go: "联系我们" },',
    '    en: { github: "GitHub", deploy: "Deploy", powered: "Powered by <b>EdgeOne Makers Agents</b>", more: "Learn more", poweredTitle: "Integrate with my product", title: "From DeepSeek Harness to Your Cloud Agent", body: "DeepSeek Harness now runs on EdgeOne Makers Agents. After you deploy, you can extend models, tools, skills, and the UI to build a cloud Agent for Vibe Coding, task automation, and content production, then publish generated apps and content to the global edge network. Makers provides an integrated solution for Agent hosting, a secure sandbox, and app delivery.", later: "Maybe later", go: "Contact us" }',
  '  };',
  '  const localeOf = () => {',
  '    const lang = (document.documentElement.lang || "").toLowerCase();',
  '    if (lang.startsWith("en")) return "en";',
  '    if (lang.startsWith("zh")) return "zh";',
  '    return intl ? "en" : "zh";',
  '  };',
  '  const githubIcon = \'<svg viewBox="0 0 16 16" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0016 8c0-4.42-3.58-8-8-8"/></svg>\';',
  '  const deployIcon = \'<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 15c-1 2-1 4-1 4s2 0 4-1"/><path d="M9 18c-1.5-.6-2.4-1.5-3-3 3.2-7 7.6-9.5 14-9-.5 6.4-3 10.8-10 14z"/><path d="M13.5 10.5a1.5 1.5 0 1 0 2.1-2.1 1.5 1.5 0 0 0-2.1 2.1z"/></svg>\';',
  '  const moreIcon = \'<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>\';',
  '  const bubbleIcon = \'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>\';',
  '  const mount = () => {',
  '    if (document.getElementById("dsh-makers-actions")) return;',
  '    const nav = document.createElement("nav");',
  '    nav.id = "dsh-makers-actions";',
  '    nav.setAttribute("aria-label", "EdgeOne Makers");',
  '    nav.dataset.docked = "false";',
  '    const github = document.createElement("a");',
  '    github.href = "https://github.com/TencentEdgeOne/deepseek-harness";',
  '    github.target = "_blank";',
  '    github.rel = "noopener noreferrer";',
  '    github.innerHTML = githubIcon + \'<span class="dsh-makers-action-label"></span>\';',
  '    const deploy = document.createElement("a");',
  '    deploy.target = "_blank";',
  '    deploy.rel = "noopener noreferrer";',
  '    deploy.innerHTML = deployIcon + \'<span class="dsh-makers-action-label"></span>\';',
  '    nav.append(github, deploy);',
  '    const powered = document.createElement("div");',
  '    powered.id = "dsh-makers-powered";',
  '    powered.dataset.docked = "false";',
  '    powered.innerHTML = \'<span class="dsh-makers-powered-label"></span><span class="dsh-makers-powered-divider" aria-hidden="true"></span><button type="button" class="dsh-makers-powered-more"><span class="dsh-makers-powered-more-label"></span>\' + moreIcon + "</button>";',
  '    const more = powered.querySelector(".dsh-makers-powered-more");',
  '    const chrome = document.createElement("div");',
  '    chrome.id = "dsh-makers-chrome";',
  '    const dialog = document.createElement("div");',
  '    dialog.id = "dsh-makers-contact";',
  '    dialog.hidden = true;',
  '    dialog.innerHTML = \'<div class="dsh-makers-contact-overlay" data-close="true"></div><div class="dsh-makers-contact-card" role="dialog" aria-modal="true" aria-labelledby="dsh-makers-contact-title"><div class="dsh-makers-contact-body"><div class="dsh-makers-contact-icon">\' + bubbleIcon + \'</div><h2 id="dsh-makers-contact-title"></h2><p></p></div><div class="dsh-makers-contact-footer"><button type="button" class="dsh-makers-contact-later" data-close="true"></button><a class="dsh-makers-contact-go" target="_blank" rel="noopener noreferrer"></a></div></div>\';',
  '    const centerCol = () => document.querySelector("[class*=\\"_centerCol\\"]");',
  '    const titleRow = () => document.querySelector("[class*=\\"_titleRow\\"]");',
  '    const headerOf = (row) => row?.closest("header") || row?.parentElement || null;',
  '    const headerVisible = (header) => {',
  '      if (!header) return false;',
  '      if ([...header.classList].some((name) => name.includes("headerHidden"))) return false;',
  '      const style = getComputedStyle(header);',
  '      return style.display !== "none" && style.visibility !== "hidden";',
  '    };',
  '    let adopting = false;',
  '    let laying = false;',
  '    let layoutRaf = 0;',
  '    const overlap = (a, b, gap) => a.left < b.right + gap && a.right + gap > b.left && a.top < b.bottom && a.bottom > b.top;',
  '    const layout = () => {',
  '      if (laying || !nav.isConnected || !powered.isConnected) return;',
  '      laying = true;',
  '      try {',
  '        document.documentElement.style.setProperty("--dsh-makers-actions-width", Math.ceil(nav.getBoundingClientRect().width) + 12 + "px");',
  '        const hit = () => {',
  '          const a = nav.getBoundingClientRect();',
  '          const b = powered.getBoundingClientRect();',
  '          if (!a.width || !b.width) return false;',
  '          if (overlap(a, b, 8)) return true;',
  '          if (powered.dataset.docked !== "true") return false;',
  '          const cluster = titleRow()?.querySelector("[class*=\\"_titleCluster\\"]");',
  '          return !!(cluster && overlap(cluster.getBoundingClientRect(), b, 8));',
  '        };',
  '        const apply = (level) => {',
  '          powered.dataset.compact = level >= 1 ? "true" : "false";',
  '          nav.dataset.compact = level >= 2 ? "true" : "false";',
  '          powered.dataset.hidden = level >= 3 ? "true" : "false";',
  '        };',
  '        const current = powered.dataset.hidden === "true" ? 3 : nav.dataset.compact === "true" ? 2 : powered.dataset.compact === "true" ? 1 : 0;',
  '        if (hit()) {',
  '          if (current < 3) apply(current + 1);',
  '        } else if (current > 0) {',
  '          apply(current - 1);',
  '          if (hit()) apply(current);',
  '        }',
  '      } finally {',
  '        laying = false;',
  '      }',
  '    };',
  '    const scheduleLayout = () => {',
  '      if (layoutRaf) return;',
  '      layoutRaf = requestAnimationFrame(() => {',
  '        layoutRaf = 0;',
  '        layout();',
  '      });',
  '    };',
  '    const adopt = () => {',
  '      if (adopting) return;',
  '      adopting = true;',
  '      try {',
  '        const host = centerCol();',
  '        if (!host) return;',
  '        const row = titleRow();',
  '        const header = headerOf(row);',
  '        const utilities = header?.querySelector("[class*=\\"_headerUtilities\\"]");',
  '        if (headerVisible(header) && utilities) {',
  '          if (nav.parentElement !== utilities) utilities.append(nav);',
  '          if (powered.parentElement !== row) row.append(powered);',
  '          chrome.remove();',
  '          nav.dataset.docked = "true";',
  '          powered.dataset.docked = "true";',
  '        } else {',
  '          if (chrome.parentElement !== host) host.append(chrome);',
  '          if (powered.parentElement !== chrome) chrome.append(powered);',
  '          if (nav.parentElement !== chrome) chrome.append(nav);',
  '          nav.dataset.docked = "false";',
  '          powered.dataset.docked = "false";',
  '        }',
  '        if (ro) {',
  '          ro.observe(nav);',
  '          ro.observe(powered);',
  '          ro.observe(host);',
  '          if (row) ro.observe(row);',
  '        }',
  '        scheduleLayout();',
  '      } finally {',
  '        adopting = false;',
  '      }',
  '    };',
  '    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(scheduleLayout);',
  '    const applyCopy = () => {',
  '      const locale = localeOf();',
  '      const t = copy[locale];',
  '      github.title = t.github;',
  '      github.querySelector(".dsh-makers-action-label").textContent = t.github;',
  '      deploy.href = deployHref;',
  '      deploy.title = t.deploy;',
  '      deploy.querySelector(".dsh-makers-action-label").textContent = t.deploy;',
  '      more.title = t.poweredTitle;',
  '      more.querySelector(".dsh-makers-powered-more-label").textContent = t.more;',
  '      powered.querySelector(".dsh-makers-powered-label").innerHTML = t.powered;',
  '      dialog.querySelector("#dsh-makers-contact-title").textContent = t.title;',
  '      dialog.querySelector(".dsh-makers-contact-body p").textContent = t.body;',
  '      dialog.querySelector(".dsh-makers-contact-later").textContent = t.later;',
  '      const go = dialog.querySelector(".dsh-makers-contact-go");',
  '      go.href = contactHref;',
  '      go.textContent = t.go;',
  '    };',
  '    applyCopy();',
  '    new MutationObserver(applyCopy).observe(document.documentElement, { attributes: true, attributeFilter: ["lang"] });',
  '    const close = () => {',
  '      dialog.hidden = true;',
  '      more.focus();',
  '    };',
  '    const open = () => {',
  '      dialog.hidden = false;',
  '      dialog.querySelector(".dsh-makers-contact-later")?.focus();',
  '    };',
  '    more.addEventListener("click", open);',
  '    dialog.addEventListener("click", (event) => {',
  '      if (event.target.closest("[data-close]")) close();',
  '    });',
  '    document.addEventListener("keydown", (event) => {',
  '      if (event.key === "Escape" && !dialog.hidden) close();',
  '    });',
  '    document.body.append(dialog);',
  '    adopt();',
  '    const observer = new MutationObserver(adopt);',
  '    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "style", "hidden"] });',
  '    window.addEventListener("resize", scheduleLayout);',
  '  };',
  '  if (document.body) mount();',
  '  else document.addEventListener("DOMContentLoaded", mount);',
  '})();',
  '</script>',
  '<!-- /dsh-makers-actions -->',
].join('\n')

function makersBootstrap(manifest) {
  const serialized = JSON.stringify(manifest).replaceAll('<', '\\u003c')
  return `<style>
.dsh-makers-tip[data-tip]{position:relative;display:inline-flex;max-width:100%;vertical-align:middle;cursor:not-allowed}
.dsh-makers-tip[data-tip]>:disabled{pointer-events:none}
.dsh-makers-locked{opacity:.45;cursor:not-allowed}
#dsh-makers-hover-tip{position:fixed;z-index:2147483647;pointer-events:none;background:var(--dsw-alias-label-primary,#1a1a1a);color:var(--dsw-alias-bg-layer-3,#fff);white-space:nowrap;border-radius:6px;padding:4px 8px;font-size:11px;line-height:17px;font-weight:400;max-width:min(320px,calc(100vw - 16px));box-shadow:0 4px 12px rgba(0,0,0,.18)}
#dsh-makers-hover-tip[hidden]{display:none!important}
</style><script>
window.__DSH_BOOT__ = ${serialized};
(() => {
  const key = 'dsh-makers-web-conversation-id';
  let conversationId = localStorage.getItem(key);
  if (!conversationId) {
    conversationId = crypto.randomUUID();
    localStorage.setItem(key, conversationId);
  }
  window.__DSH_MAKERS_CONVERSATION_ID__ = conversationId;
  const nativeFetch = window.fetch.bind(window);
  window.fetch = (input, init = {}) => {
    const target = new URL(typeof input === 'string' || input instanceof URL ? input : input.url, location.href);
    if (target.origin !== location.origin || (!target.pathname.startsWith('/api') && !target.pathname.startsWith('/rpc'))) {
      return nativeFetch(input, init);
    }
    const headers = new Headers(input instanceof Request ? input.headers : init.headers);
    headers.set('makers-conversation-id', conversationId);
    if (input instanceof Request) return nativeFetch(new Request(input, { ...init, headers }));
    return nativeFetch(input, { ...init, headers });
  };
})();
(() => {
  const id = 'dsh-makers-hover-tip';
  const hostOf = (node) => {
    if (!(node instanceof Element)) return null;
    const tip = (el) => el && el.getAttribute('data-tip') ? el : null;
    const from = (el) => el ? tip(el) || tip(el.querySelector('[data-tip]')) : null;
    return tip(node.closest('[data-tip]'))
      || from(node.closest('[role="menuitem"]'))
      || from([...node.children].find((child) => child.getAttribute('role') === 'menuitem'));
  };
  const bubble = () => {
    let el = document.getElementById(id);
    if (el) return el;
    el = document.createElement('div');
    el.id = id;
    el.setAttribute('role', 'tooltip');
    el.hidden = true;
    document.body.appendChild(el);
    return el;
  };
  const hide = () => {
    const el = document.getElementById(id);
    if (el) el.hidden = true;
  };
  const show = (host) => {
    const text = host.getAttribute('data-tip');
    if (!text) return hide();
    const el = bubble();
    el.textContent = text;
    el.hidden = false;
    const r = host.closest('[role="menuitem"]')?.getBoundingClientRect() ?? host.getBoundingClientRect();
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    let left = r.left + r.width / 2 - w / 2;
    left = Math.max(8, Math.min(left, window.innerWidth - w - 8));
    let top = r.top - h - 8;
    if (top < 8) top = r.bottom + 8;
    el.style.left = left + 'px';
    el.style.top = top + 'px';
  };
  document.addEventListener('pointerover', (event) => {
    const host = hostOf(event.target);
    if (host) show(host);
    else hide();
  });
  document.addEventListener('pointerdown', hide);
  window.addEventListener('scroll', hide, true);
})();
</script>
${makersActionsHead}`
}

await rm(publicDir, { recursive: true, force: true })
await mkdir(publicDir, { recursive: true })
await cp(webDist, publicDir, { recursive: true })
const entries = [
  ...(await clientPackages()),
  await preparePqgModuleSettingsClient(),
].sort((left, right) => left.id.localeCompare(right.id))
if (entries.length < 30) throw new Error(`Expected the DSH Web roster, found only ${String(entries.length)} bundles.`)
const graph = { rev: hash(JSON.stringify(entries)), entries }
const shellHtml = await readFile(join(webDist, 'index.html'), 'utf8')
const headWithCharset = '<head>\n    <meta charset="utf-8" />'
if (!shellHtml.includes(headWithCharset)) {
  throw new Error('Published DSH Web index.html no longer declares charset as the first <head> child.')
}
// Keep charset first so the HTML5 encoding sniff (first 1024 bytes) sees UTF-8
// before the overlay script's Chinese copy. Injecting before charset made first
// paint mojibake until a reload remembered UTF-8.
const html = shellHtml.replace(headWithCharset, `${headWithCharset}${makersBootstrap(graph)}`)
await writeFile(join(root, 'index.html'), html)
await writeFile(join(publicDir, 'index.html'), html)
console.log(`Prepared DSH Web with ${String(entries.length)} client plugins.`)
