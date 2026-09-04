import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('build preparation installs the official DSH Web plugin graph', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8')
  assert.match(html, /window\.__DSH_BOOT__/)
  assert.match(html, /@deepseek-ai\/dsh-client-ui-conversation/)
  assert.match(html, /@deepseek-ai\/dsh-client-ui-trajectory/)
  assert.match(html, /@deepseek-ai\/dsh-client-ui-workspace/)
  assert.doesNotMatch(html, /@deepseek-ai\/dsh-client-ui-cordis/)
})

test('Makers connection bundle uses SSE and injects conversation routing', async () => {
  const connection = await readFile(
    new URL('../public/plugins/@deepseek-ai/dsh-client-connection/client.js', import.meta.url),
    'utf8',
  )
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8')
  assert.match(connection, /readSse\(MUX_EVENTS_PATH/)
  assert.match(connection, /readSse\(HOST_EVENTS_PATH/)
  assert.match(html, /makers-conversation-id/)
})

test('built-in agent presets are locked in the prepared Web UI', async () => {
  const source = await readFile(
    new URL('../public/plugins/@deepseek-ai/dsh-client-ui-agent-preset/client.js', import.meta.url),
    'utf8',
  )
  assert.match(source, /function isLockedBuiltInPreset\(id\)/)
  assert.match(source, /dsh-makers-tip dsh-makers-locked/)
  assert.match(source, /data-locked": isLockedBuiltInPreset\(row\.id\)/)
  assert.match(source, /data-tip": isLockedBuiltInPreset\(row\.id\)/)
  assert.match(source, /presetMakersName: "Makers mode"/)
  assert.match(source, /presetMakersName: "Makers 模式"/)
  assert.match(source, /presetMakersDescription: "A DSH Agent that uses EdgeOne Makers MCP tools, Sandbox, and AI Gateway."/)
  assert.match(source, /preset\.id === "makers"/)
  assert.doesNotMatch(source, /slots\.inject\("settings\.section"/)
  assert.doesNotMatch(source, /slots\.inject\("settings\.general\.item"/)
  assert.doesNotMatch(source, /conversation\.hero\.agentPreset/)
  assert.doesNotMatch(source, /conversation\.session\.header\.actions/)
})

test('permission modes keep the composer picker and use Makers sandbox copy', async () => {
  const conversation = await readFile(
    new URL('../public/plugins/@deepseek-ai/dsh-client-ui-conversation/client.js', import.meta.url),
    'utf8',
  )
  const permission = await readFile(
    new URL('../public/plugins/@deepseek-ai/dsh-client-ui-permission-presets/client.js', import.meta.url),
    'utf8',
  )
  assert.match(conversation, /function PermissionSelect\(\{ value, locked, command, t \}\)/)
  assert.match(conversation, /command\(`\/permission \$\{id\}`\)/)
  assert.match(conversation, /"access.read-only.detail": "Inspect the EdgeOne Makers sandbox: list and read files. Writes, commands, and preview will ask you to confirm/)
  assert.match(conversation, /"access.read-only.detail": "只能查看 EdgeOne Makers 沙箱：列出和读取文件。写入、运行命令或发布预览时会询问你确认/)
  assert.match(conversation, /"access.workspace-write.detail": "Read and write files in the EdgeOne Makers sandbox. Commands and preview will ask you to confirm/)
  assert.match(conversation, /access\.\$\{currentValue\}\.detail/)
  assert.match(permission, /slots\.inject\("settings\.general\.item"/)
  assert.match(permission, /available: \(session\) => selectOf\(sessionFor\(session\)\) !== void 0/)
  assert.match(permission, /EdgeOne Makers 沙箱/)
})

test('workspace UI shows a single cloud workspace without switching', async () => {
  const conversation = await readFile(
    new URL('../public/plugins/@deepseek-ai/dsh-client-ui-conversation/client.js', import.meta.url),
    'utf8',
  )
  const workspace = await readFile(
    new URL('../public/plugins/@deepseek-ai/dsh-client-ui-workspace/client.js', import.meta.url),
    'utf8',
  )
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8')
  assert.match(conversation, /"hero.cloudWorkspace": "云端工作区"/)
  assert.match(conversation, /"hero.cloudWorkspace": "Cloud Workspace"/)
  assert.doesNotMatch(conversation, /hero.workspaceLocked/)
  assert.match(workspace, /"section.workspaces": "云端工作区"/)
  assert.match(workspace, /"section.workspaces": "Cloud Workspace"/)
  assert.match(workspace, /wide && \(0, react_jsx_runtime.jsxs\)\("div", \{\s*className: WorkspaceBrowser_module_css_default.sectionHeader/)
  assert.doesNotMatch(workspace, /workspace.locked/)
  assert.doesNotMatch(workspace, /jsx\)\(ProjectRowItem/)
  assert.match(html, /dsh-makers-hover-tip/)
  assert.match(html, /hostOf/)
})

test('charset is declared in the first 1024 bytes before overlay copy', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8')
  const charset = html.match(/<meta\s+charset=["']utf-8["']\s*\/?>/i)
  assert.ok(charset?.index != null, 'missing utf-8 charset meta')
  assert.ok(
    Buffer.byteLength(html.slice(0, charset.index), 'utf8') < 1024,
    'charset must be inside the HTML5 encoding-sniff window',
  )
  assert.ok(charset.index < html.indexOf('window.__DSH_BOOT__'))
  assert.ok(charset.index < html.indexOf('GitHub 源码'))
})

test('locale defaults from hostname instead of the browser language', async () => {
  const source = await readFile(
    new URL('../public/plugins/@deepseek-ai/dsh-client-locale/client.js', import.meta.url),
    'utf8',
  )
  assert.match(
    source,
    /function resolveInitialLocale\(\) \{\n\t\t\tif \(typeof window !== "undefined" && location\.hostname\.endsWith\("\.edgeone\.dev"\)\) return "en";\n\t\t\treturn "zh";/,
  )
  assert.doesNotMatch(source, /detectBrowserLocale/)
})

test('page chrome keeps GitHub, deploy, and a contact dialog', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8')
  assert.match(html, /dsh-makers-actions/)
  assert.match(html, /dsh-makers-powered/)
  assert.match(html, /dsh-makers-powered-more/)
  assert.match(html, /dsh-makers-powered-divider/)
  assert.match(html, /dsh-makers-chrome/)
  assert.match(html, /container:dsh-center \/ inline-size/)
  assert.match(html, /--dsh-makers-actions-width/)
  assert.match(html, /data-compact/)
  assert.match(html, /data-hidden/)
  assert.match(html, /@container dsh-center \(max-width:880px\)/)
  assert.match(html, /\[class\*="_composerHero"\]\{z-index:5\}/)
  assert.doesNotMatch(html, /#dsh-makers-actions\{[^}]*z-index:40/)
  assert.doesNotMatch(html, /#dsh-makers-powered\{[^}]*z-index:40/)
  assert.doesNotMatch(html, /@media \(max-width:720px\)/)
  assert.match(html, /more: "了解更多"/)
  assert.match(html, /more: "Learn more"/)
  assert.match(html, /powered-more:hover svg\{transform:translateX\(2px\)\}/)
  assert.match(html, /GitHub 源码/)
  assert.match(html, /模版部署/)
  assert.doesNotMatch(html, /一键部署模版/)
  assert.match(html, /deploy: "Deploy"/)
  assert.match(html, /EdgeOne Makers Agents/)
  assert.match(html, /headerUtilities/)
  assert.match(html, /titleRow/)
  assert.match(html, /从 DeepSeek Harness 到你的云端 Agent/)
  assert.match(html, /From DeepSeek Harness to Your Cloud Agent/)
  assert.match(html, /自由扩展模型、工具、技能与界面/)
  assert.match(html, /extend models, tools, skills, and the UI/)
  assert.match(html, /以后再说/)
  assert.match(html, /Maybe later/)
  assert.match(html, /联系我们/)
  assert.match(html, /Contact us/)
  assert.match(html, /dsh-makers-contact/)
  assert.match(html, /github.com\/TencentEdgeOne\/deepseek-harness/)
  assert.match(html, /deployHref = intl \? "https:\/\/edgeone.ai\/makers\/new" \+ deployParams : "https:\/\/console.cloud.tencent.com\/edgeone\/makers\/new" \+ deployParams/)
  assert.match(html, /from=within&fromAgent=1&agentLang=typescript/)
  assert.match(html, /deploy\.href = deployHref/)
  assert.match(html, /contactHref = intl \? "https:\/\/pages.edgeone.ai\/contact\?source=deepseek-harness" : "https:\/\/cloud.tencent.com\/online-service\?from=connect-us"/)
  assert.match(html, /go\.href = contactHref/)
  assert.match(html, /const host = centerCol\(\);\s*if \(!host\) return;/)
  assert.doesNotMatch(html, /\|\| document\.body/)
})

test('session log export downloads through fetch so conversation routing is preserved', async () => {
  const source = await readFile(
    new URL('../public/plugins/@deepseek-ai/dsh-session-log-export/client.js', import.meta.url),
    'utf8',
  )
  assert.match(source, /method: "GET"/)
  assert.match(source, /URL\.createObjectURL\(blob\)/)
  assert.doesNotMatch(source, /method: "HEAD"/)
})

test('settings and model welcome preferences persist through Host even off loopback', async () => {
  const settings = await readFile(
    new URL('../public/plugins/@deepseek-ai/dsh-client-ui-settings/client.js', import.meta.url),
    'utf8',
  )
  const models = await readFile(
    new URL('../public/plugins/@deepseek-ai/dsh-client-ui-settings-models/client.js', import.meta.url),
    'utf8',
  )
  const selection = await readFile(
    new URL('../public/plugins/@deepseek-ai/dsh-client-ui-model-selection/client.js', import.meta.url),
    'utf8',
  )
  assert.match(settings, /new SettingsScopeController\(connection\.api, spec, "host"\)/)
  assert.doesNotMatch(settings, /connection\.isLoopback \? "host" : "memory"/)
  assert.match(models, /new WelcomeNoticeStore\(connection\.api, "host"\)/)
  assert.doesNotMatch(models, /connection\.isLoopback \? "host" : "memory"/)
  assert.doesNotMatch(models, /id: "welcome-notice"/)
  assert.doesNotMatch(models, /id: "deepseek-official"/)
  assert.match(models, /makersProvided: "Models are provided by EdgeOne Makers\."/)
  assert.match(models, /makersProvided: "模型由 EdgeOne Makers 提供。"/)
  assert.match(models, /https:\/\/pages\.edgeone\.ai\/document\/models/)
  assert.match(models, /https:\/\/cloud\.tencent\.com\/document\/product\/1552\/132748/)
  assert.match(selection, /group\.id === "edgeone-makers"/)
  assert.match(selection, /return \{ \.\.\.result\.value, groups: makersGroups \}/)
  assert.doesNotMatch(selection, /group\.id !== "deepseek-official"/)
  assert.match(selection, /inflightSelect/)
  assert.match(selection, /const optimistic =/)
  assert.match(selection, /if \(state.groups.length === 0\) reload\(\)/)
  assert.match(selection, /close\(true\);\n\t\t\t\tselect\(selection\)\.then\(settleSelection\)/)
  assert.match(selection, /if \(accepted\) return/)
  assert.doesNotMatch(selection, /if \(accepted\) \{\n\t\t\t\t\tif \(rootRef\.current !== null\) close\(true\)/)
})

test('generated API routes expose static files the Makers scanner accepts', async () => {
  const route = await readFile(new URL('../agents/api/session.prompt.ts', import.meta.url), 'utf8')
  const remoteRoute = await readFile(new URL('../agents/api/commands/list.ts', import.meta.url), 'utf8')
  assert.match(route, /export async function onRequest/)
  assert.match(remoteRoute, /export async function onRequest/)
  assert.match(remoteRoute, /\.\.\/_proxy\.ts/)
})
