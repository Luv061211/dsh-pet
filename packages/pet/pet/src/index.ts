/**
 * Global desktop-pet domain: durable user preferences and a live,
 * session-event-derived activity read model for companion clients.
 * @module @luv1211/dsh-pet
 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import { Service, type Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { settingsNamespace } from '@deepseek-ai/dsh-settings'
import type { SettingsScope } from '@deepseek-ai/dsh-settings'
// Type-only: merges the optional `desktopCompanion`, `webServer`, and
// `directoryPicker` service declarations so ctx.get() below returns their
// real types.
import type {} from '@luv1211/dsh-desktop-companion'
import type {} from '@deepseek-ai/dsh-host-directory-picker'
import type {} from '@deepseek-ai/dsh-host-webserver'
import { PetActivityProjection } from './activity.ts'
import { handlePetHttpRequest, PET_API_ACTION_PATH, PET_API_SNAPSHOT_PATH } from './http-api.ts'
import { PetCatalogStore, type PetCatalogOptions } from './catalog.ts'
import { createPetNativeActions } from './host-native.ts'
import { FRAME_AT_SOURCE } from '@luv1211/dsh-pet-compat'
import {
  DEFAULT_PET_ID,
  DEFAULT_PET_SIZE_PX,
  PET_COMPAT_ATLAS,
  PET_PREFERENCE_VERSION,
  comparePetActivities,
  petStatusForHostActivity,
  petWidthForSize,
  resolvePetPreference,
  validatePetPackage,
  validatePetSize,
} from './runtime.ts'
import type {
  PetActivitySource,
  PetFolderResult,
  PetHostActivityRecord,
  PetNativeActions,
  PetImportResult,
  PetPreference,
  PetSessionActivity,
  PetSnapshot,
  PetCatalog,
} from './types.ts'

export type * from './types.ts'
export type * from './renderer.ts'
export {
  DEFAULT_PET_ID,
  DEFAULT_PET_SIZE_PX,
  MAX_PET_SIZE_PX,
  MIN_PET_SIZE_PX,
  PET_PREFERENCE_VERSION,
  comparePetActivities,
  defaultPetPreference,
  isDragMovement,
  petStatusForHostActivity,
  petWidthForSize,
  resolvePetPreference,
  selectLookDirection,
  selectPetPresentation,
  validatePetSize,
  validatePetPackage,
} from './runtime.ts'
export { petSpriteAvatar, petSpriteFrame } from './renderer.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    pets: PetService
  }
}

/** Host configuration for the DSH-owned package root and validation limits. */
export interface Config extends PetCatalogOptions {}

/** Schema of the durable `pet` settings namespace. */
const petPreferenceSchema: z<PetPreference> = z.transform(z.object({
  version: z.number().default(PET_PREFERENCE_VERSION),
  selectedPetId: z.string().default(DEFAULT_PET_ID),
  awake: z.boolean().default(true),
  sizePx: z.number().default(DEFAULT_PET_SIZE_PX),
}), value => resolvePetPreference(value), true).default({} as PetPreference)

/** Reject a preference that cannot select a package or preserve its document meaning. */
function validatePetPreference(value: PetPreference): void {
  if (value.selectedPetId.length === 0) throw new TypeError('pet preference selectedPetId must not be empty')
  validatePetSize(value.sizePx)
}

/** Pet service (`ctx.pets`): one durable preference writer and activity aggregator. */
export class PetService extends Service {
  static inject = ['settings']
  static Config: z<Config> = z.object({
    dshHome: z.string(),
    petRoot: z.string(),
    maxManifestBytes: z.natural().default(16 * 1024),
    maxSpriteBytes: z.natural().default(16 * 1024 * 1024),
    decodeTimeoutMs: z.natural().min(1).default(10_000),
  })

  private readonly scope: SettingsScope<PetPreference>
  private preference: PetPreference
  private readonly catalogStore: PetCatalogStore
  private catalog: PetCatalog
  private readonly activities = new Map<string, PetSessionActivity>()
  private tail: Promise<void> = Promise.resolve()

  constructor(ctx: Context, config: Config = {}) {
    super(ctx, 'pets')
    this.catalogStore = new PetCatalogStore(config)
    this.catalog = this.catalogStore.getCatalog()
    this.scope = ctx.settings.register(settingsNamespace('pet'), petPreferenceSchema, {
      validate: validatePetPreference,
    })
    this.preference = this.scope.get()
    if (!this.catalogStore.has(this.preference.selectedPetId)) {
      throw new TypeError(`pet ${this.preference.selectedPetId} was not found in the pet catalog`)
    }
    ctx.effect(() => this.scope.watch((next) => {
      this.preference = next
      this.publish()
    }), 'dsh-pet: preference watch')
    ctx.effect(() => this.catalogStore.subscribe((catalog) => {
      this.catalog = catalog
      this.publish()
    }), 'dsh-pet: catalog watch')
    const activitySource: PetActivitySource = ctx.get('petActivity') ?? new PetActivityProjection(ctx)
    this.applyActivity(activitySource.getSnapshot())
    ctx.effect(() => activitySource.subscribe((records) => {
      this.applyActivity(records)
    }), 'dsh-pet: activity projection')
    const desktopCompanion = ctx.get('desktopCompanion')
    const webServer = ctx.get('webServer')
    if (webServer !== undefined) {
      for (const path of [PET_API_SNAPSHOT_PATH, PET_API_ACTION_PATH]) {
        ctx.effect(() => webServer.register({
          kind: 'exact', path, handler: (req, res) => { void handlePetHttpRequest(this, req, res) },
        }), `dsh-pet: HTTP API ${path}`)
      }
    }
    if (desktopCompanion !== undefined && webServer !== undefined) {
      ctx.effect(() => desktopCompanion.register({
        id: 'pet',
        entryPath: '/__dsh/pet/overlay',
        width: petWidthForSize(DEFAULT_PET_SIZE_PX),
        height: DEFAULT_PET_SIZE_PX,
        capabilities: {
          drag: true,
          pointerInteraction: true,
          resize: {
            minWidth: petWidthForSize(80),
            maxWidth: petWidthForSize(224),
            minHeight: 80,
            maxHeight: 224,
          },
        },
      }), 'dsh-pet: desktop companion')
      ctx.effect(() => webServer.register({
        kind: 'exact', path: '/__dsh/pet/overlay', handler: (_req, res) => {
          res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' })
          res.end(createPetOverlayHtml())
        },
      }), 'dsh-pet: companion page')
      ctx.effect(() => webServer.register({
        kind: 'exact', path: '/__dsh/pet/overlay-state', handler: (_req, res) => {
          res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
          res.end(JSON.stringify(this.getSnapshot()))
        },
      }), 'dsh-pet: companion state')
      ctx.effect(() => webServer.register({
        kind: 'exact', path: '/__dsh/pet/overlay-awake', handler: (req, res) => {
          void this.handleOverlayAwake(req, res)
        },
      }), 'dsh-pet: companion awake write')
    }
    if (webServer !== undefined) ctx.effect(() => webServer.register({
      kind: 'prefix',
      path: '/__dsh/pet/assets',
      handler: (req, res) => {
        let pathname: string
        try {
          pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://dsh.local').pathname)
        } catch {
          res.writeHead(404)
          res.end()
          return
        }
        const match = /^\/__dsh\/pet\/assets\/([^/]+)\/spritesheet\.webp$/.exec(pathname)
        const asset = match?.[1] === undefined ? undefined : this.catalogStore.getAsset(match[1])
        if (asset === undefined) {
          res.writeHead(404)
          res.end()
          return
        }
        res.writeHead(200, { 'content-type': 'image/webp', 'cache-control': 'no-store' })
        res.end(Buffer.from(asset))
      },
    }), 'dsh-pet: catalog assets')
    ctx.effect(() => { return () => { this.catalogStore.dispose() } }, 'dsh-pet: catalog dispose')
  }

  /**
   * The host-native operations the current composition provides. Resolved
   * per access, not captured at construction: the `petNative` provider mounts
   * as a later tree row than this service, and the composed directory picker
   * can also enter the context later. An explicit `petNative` provider wins;
   * otherwise the actions derive from the composed directory picker when it
   * serves the native backend.
   * @returns the native operations, or `undefined` in browser-only compositions.
   */
  private get nativeActions(): PetNativeActions | undefined {
    return this.ctx.get('petNative') ?? createPetNativeActions(this.ctx.get('directoryPicker')?.capability())
  }

  /**
   * Read the latest durable preference and every current activity record.
   * @returns a detached, deterministically ordered snapshot.
   */
  getSnapshot(): PetSnapshot {
    const activities = [...this.activities.values()].sort(comparePetActivities).map(activity => ({ ...activity }))
    const selected = activities[0]
    return {
      preference: { ...this.preference },
      catalog: { pets: this.catalog.pets.map(pet => ({ ...pet })) },
      petRoot: this.catalogStore.petRoot,
      capabilities: {
        canImport: this.nativeActions !== undefined,
        canOpenFolder: this.nativeActions !== undefined,
      },
      activities,
      ...(selected === undefined ? {} : { selectedActivity: { ...selected } }),
    }
  }

  /**
   * Read the current validated built-in and user package descriptors.
   * @returns a detached catalog of validated package descriptors.
   */
  getCatalog(): PetCatalog {
    return { pets: this.catalog.pets.map(pet => ({ ...pet })) }
  }

  /**
   * Import one validated package selected by the native host, without accepting a client path.
   * @returns the publication, cancellation, or host-availability result.
   */
  async importPetPackage(): Promise<PetImportResult> {
    const native = this.nativeActions
    if (native === undefined) return { outcome: 'host-unavailable' }
    const selected = await native.pickPetPackage()
    if (selected === null) return { outcome: 'cancelled' }
    const pet = this.catalogStore.importPackage(selected.manifestBytes, selected.spritesheetBytes)
    return { outcome: 'published', pet }
  }

  /**
   * Rescan the user package root and republish the catalog, so packages added
   * or removed on disk appear without a restart.
   * @returns the fresh snapshot after the rescan.
   */
  refreshCatalog(): PetSnapshot {
    this.catalogStore.reload()
    return this.getSnapshot()
  }

  /**
   * Replace one existing user package's content with bytes selected by the
   * native host. The picked manifest must name the requested package, and a
   * mismatch or a non-user target fails before anything is written.
   * @param petId - user package identifier to replace.
   * @returns the replacement, cancellation, or host-availability result.
   */
  async updatePetPackage(petId: string): Promise<PetImportResult> {
    const native = this.nativeActions
    if (native === undefined) return { outcome: 'host-unavailable' }
    const selected = await native.pickPetPackage()
    if (selected === null) return { outcome: 'cancelled' }
    const picked = validatePetPackage(selected.manifestBytes, selected.spritesheetBytes, { source: 'user' })
    if (picked.id !== petId) throw new TypeError(`selected pet package ${picked.id} does not match update target ${petId}`)
    const pet = this.catalogStore.replacePackage(selected.manifestBytes, selected.spritesheetBytes)
    return { outcome: 'published', pet }
  }

  /**
   * Ask the native host to open the configured DSH pet directory.
   * @returns the opened or host-availability result.
   */
  async openPetFolder(): Promise<PetFolderResult> {
    const native = this.nativeActions
    if (native === undefined) return { outcome: 'host-unavailable' }
    this.catalogStore.ensureRoot()
    await native.openPetFolder(this.catalogStore.petRoot)
    return { outcome: 'opened' }
  }

  /**
   * Select a built-in or previously imported pet package.
   * @param selectedPetId - non-empty package identifier.
   * @returns the committed fresh snapshot.
   */
  async selectPet(selectedPetId: string): Promise<PetSnapshot> {
    if (selectedPetId.length === 0) throw new TypeError('pet preference selectedPetId must not be empty')
    if (!this.catalogStore.has(selectedPetId)) throw new TypeError(`pet ${selectedPetId} was not found in the pet catalog`)
    return this.commit(preference => ({ ...preference, selectedPetId }))
  }

  /**
   * Persist one validated logical CSS height for the selected companion.
   * @param sizePx - logical CSS height between the configured pet limits.
   * @returns the committed fresh snapshot.
   */
  async setSize(sizePx: number): Promise<PetSnapshot> {
    validatePetSize(sizePx)
    return this.commit(preference => ({ ...preference, sizePx }))
  }

  /**
   * Wake or tuck the selected companion.
   * @param awake - whether companion clients render the selected pet awake.
   * @returns the committed fresh snapshot.
   */
  setAwake(awake: boolean): Promise<PetSnapshot> {
    return this.commit(preference => ({ ...preference, awake }))
  }

  /**
   * Serve the companion page's one awake write (`POST {awake: boolean}`),
   * answering with the committed snapshot so the page applies it immediately.
   * The cross-site write fence matches the API gateway: only the JSON media
   * type is accepted, which forces a CORS preflight this loopback server never
   * answers, so a "simple" cross-site POST cannot tuck the pet blind.
   * @param req - the raw request; method, media type, and body are validated here.
   * @param res - the raw response; every failure path answers a status without a body.
   */
  private async handleOverlayAwake(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const fail = (status: number): void => {
      res.writeHead(status)
      res.end()
    }
    if (req.method !== 'POST') {
      fail(405)
      return
    }
    const mediaType = req.headers['content-type']?.split(';', 1)[0]?.trim().toLowerCase()
    if (mediaType !== 'application/json') {
      fail(415)
      return
    }
    let payload: unknown
    try {
      payload = JSON.parse(await readBoundedBody(req, OVERLAY_AWAKE_BODY_LIMIT_BYTES))
    } catch (error) {
      fail(error instanceof CompanionBodyLimitError ? 413 : 400)
      return
    }
    if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
      fail(400)
      return
    }
    const keys = Object.keys(payload)
    if (keys.length !== 1 || keys[0] !== 'awake') {
      fail(400)
      return
    }
    const awake = (payload as { awake: unknown }).awake
    if (typeof awake !== 'boolean') {
      fail(400)
      return
    }
    let snapshot: PetSnapshot
    try {
      snapshot = await this.setAwake(awake)
    } catch {
      // The preference write failed (settings persistence); answer without hanging.
      fail(500)
      return
    }
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
    res.end(JSON.stringify(snapshot))
  }

  /** Replace the local adapter state from one detached host projection. */
  private applyActivity(records: readonly PetHostActivityRecord[]): void {
    const next = new Map<string, PetSessionActivity>()
    for (const record of records) {
      const status = petStatusForHostActivity(record)
      if (status === undefined) continue
      next.set(String(record.sessionId), {
        sessionId: record.sessionId,
        title: record.title,
        status,
        since: record.since,
      })
    }
    this.activities.clear()
    for (const [sessionId, activity] of next) this.activities.set(sessionId, activity)
    this.publish()
  }

  /** Serialize one preference write and return only after durable persistence. */
  private commit(mutate: (preference: PetPreference) => PetPreference): Promise<PetSnapshot> {
    const run = async (): Promise<void> => {
      const next = mutate(this.preference)
      try {
        await this.scope.replace({ ...next })
        this.preference = next
      } catch (error) {
        this.preference = this.scope.get()
        throw error
      }
    }
    const attempt = this.tail.then(run)
    this.tail = attempt.then(() => undefined, () => undefined)
    return attempt.then(() => this.getSnapshot())
  }

  /** Publish a detached read model after a preference commit or activity transition. */
  private publish(): void {
    this.ctx.emit('pet/update', this.getSnapshot())
  }
}

const PET_OVERLAY_RUNTIME_CONFIG = JSON.stringify({
  atlas: PET_COMPAT_ATLAS,
})

/** Maximum accepted companion write body in bytes; the payload is one boolean. */
const OVERLAY_AWAKE_BODY_LIMIT_BYTES = 1_024

/** Marker for a request body that drained past `OVERLAY_AWAKE_BODY_LIMIT_BYTES`. */
class CompanionBodyLimitError extends Error {}

/**
 * Read one request body as UTF-8. Chunks past the byte cap are drained but
 * discarded — bounded memory, and the client still receives the error status.
 * @param req - the request whose body is draining.
 * @param limitBytes - inclusive byte cap before the read turns lossy.
 * @returns the full body, or rejects with `CompanionBodyLimitError` when it passed the cap.
 */
function readBoundedBody(req: IncomingMessage, limitBytes: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let total = 0
    let overLimit = false
    req.on('data', (chunk: Buffer) => {
      total += chunk.length
      if (total > limitBytes) overLimit = true
      else chunks.push(chunk)
    })
    req.on('end', () => {
      if (overLimit) reject(new CompanionBodyLimitError())
      else resolve(Buffer.concat(chunks).toString('utf8'))
    })
    req.on('error', reject)
  })
}

/** Return a static safe DOM document; live snapshot values arrive through JSON. */
function createPetOverlayHtml(): string {
  return `<!doctype html>
<meta name="color-scheme" content="dark">
<style>
html,body{margin:0;overflow:hidden;background:transparent;font:12px system-ui;color:white}
#pet-root{position:fixed;inset:0;pointer-events:none}
#pet-button{position:absolute;left:0;top:0;border:0;padding:0;background:transparent;cursor:grab;color:inherit;pointer-events:auto;user-select:none;-webkit-user-select:none}
#pet-button:active{cursor:grabbing}
#pet-sprite{display:block;background-repeat:no-repeat;image-rendering:pixelated;filter:drop-shadow(0 2px 3px #000)}
#pet-label{display:block;text-align:center;text-shadow:0 1px 2px #000;white-space:nowrap}
#pet-menu{position:fixed;z-index:2;border:1px solid #4a4f5a;border-radius:6px;background:#242832;box-shadow:0 4px 10px #000a;padding:3px;pointer-events:auto}
#pet-menu button{display:block;border:0;background:transparent;color:inherit;font:inherit;text-align:left;padding:4px 12px;border-radius:4px;cursor:default;white-space:nowrap}
#pet-menu button:hover{background:#3b4152}
</style>
<main id="pet-root"><button id="pet-button" type="button"><span id="pet-sprite" aria-hidden="true"></span><span id="pet-label"></span></button><div id="pet-menu" role="menu" hidden><button id="pet-menu-close" type="button" role="menuitem">关闭宠物</button></div></main>
<script>
const config=${PET_OVERLAY_RUNTIME_CONFIG};
const frameAt=${FRAME_AT_SOURCE};
const button=document.getElementById('pet-button');
const sprite=document.getElementById('pet-sprite');
const label=document.getElementById('pet-label');
const menu=document.getElementById('pet-menu');
const menuClose=document.getElementById('pet-menu-close');
const api=window.dshDesktopCompanion;
let current=null;
let hover=false;
let drag=null;
let menuOpen=false;
let moved=false;
let animationName='idle';
let activityAnimationName='idle';
let frameStarted=performance.now();
const motionQuery=window.matchMedia?window.matchMedia('(prefers-reduced-motion: reduce)'):null;
let reducedMotion=motionQuery?.matches===true;
motionQuery?.addEventListener?.('change',event=>{reducedMotion=event.matches;frameStarted=performance.now()});
function activityState(status){
  if(status==='needs-input')return 'waiting';
  if(status==='blocked')return 'failed';
  if(status==='ready')return 'review';
  if(status==='running')return 'running';
  return 'idle';
}
function selectedPet(){
  if(current===null)return null;
  return current.catalog.pets.find(pet=>pet.id===current.preference.selectedPetId)||current.catalog.pets[0]||null;
}
function applySnapshot(next){
  const previousPet=current===null?null:selectedPet();
  const previousActivity=activityAnimationName;
  const previousSize=current?.preference.sizePx;
  const nextActivity=activityState(next.selectedActivity?.status);
  current=next;
  const pet=selectedPet();
  const awake=next.preference.awake&&pet!==null;
  if(previousActivity!==nextActivity||previousPet?.id!==pet?.id||previousPet?.assetUrl!==pet?.assetUrl||previousSize!==next.preference.sizePx){
    activityAnimationName=nextActivity;
    animationName=nextActivity;
    frameStarted=performance.now();
  }
  // Keep the Electron companion window sized to the sprite: the shell clamps
  // the request into the registered resize capability (74..207 x 80..224), and
  // the first sample (previousSize===undefined) reconciles a window restored at
  // a stale height with the current preference.
  if(previousSize!==next.preference.sizePx&&api){
    void api.resize({width:Math.round(next.preference.sizePx*config.atlas.cellWidth/config.atlas.cellHeight),height:next.preference.sizePx}).catch(()=>{});
  }
  button.hidden=!awake;
  if(!awake){
    closeMenu();
    applyPointerInteraction();
    return;
  }
  button.style.width=String(Math.round(next.preference.sizePx*config.atlas.cellWidth/config.atlas.cellHeight))+'px';
  button.style.height=String(next.preference.sizePx)+'px';
  label.textContent=next.selectedActivity?next.selectedActivity.status:'ready';
  button.setAttribute('aria-label','DeepSeek Harness pet: '+label.textContent);
}
// The companion window must not eat clicks while nothing visible can receive
// them: interactive only while the pet is awake and the pointer is over the
// pet, a menu is open, or a drag owns the pointer.
function applyPointerInteraction(){
  const interactive=current!==null&&current.preference.awake&&(hover||menuOpen||drag!==null);
  if(api)void api.setPointerInteraction({interactive}).catch(()=>{});
}
function openMenu(x,y){
  menu.hidden=false;
  menuOpen=true;
  menu.style.left=String(Math.max(0,Math.min(x,window.innerWidth-menu.offsetWidth)))+'px';
  menu.style.top=String(Math.max(0,Math.min(y,window.innerHeight-menu.offsetHeight)))+'px';
  applyPointerInteraction();
}
function closeMenu(){
  if(!menuOpen)return;
  menu.hidden=true;
  menuOpen=false;
  applyPointerInteraction();
}
async function closePet(){
  closeMenu();
  try{
    const response=await fetch('/__dsh/pet/overlay-awake',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({awake:false})});
    if(response.ok)applySnapshot(await response.json());
  }catch{
    // Write failure: the menu closing is the only immediate effect; the next
    // overlay-state sync re-applies the authoritative preference.
  }
}
function renderFrame(time){
  const pet=selectedPet();
  if(current!==null&&pet!==null&&current.preference.awake){
    const name=hover?'jumping':animationName;
    const elapsed=time-frameStarted;
    const selection=frameAt(pet.animations,name,elapsed,reducedMotion,new Set());
    const spriteIndex=selection?.spriteIndex??0;
    const displayRow=Math.floor(spriteIndex/config.atlas.columns);
    const displayColumn=spriteIndex%config.atlas.columns;
    sprite.style.width=String(Math.round(current.preference.sizePx*config.atlas.cellWidth/config.atlas.cellHeight))+'px';
    sprite.style.height=String(current.preference.sizePx)+'px';
    sprite.style.backgroundImage='url('+pet.assetUrl+')';
    sprite.style.backgroundSize=String(Math.round(current.preference.sizePx*config.atlas.columns*config.atlas.cellWidth/config.atlas.cellHeight))+'px '+String(current.preference.sizePx*config.atlas.rows)+'px';
    sprite.style.backgroundPosition=String(-displayColumn*Math.round(current.preference.sizePx*config.atlas.cellWidth/config.atlas.cellHeight))+'px '+String(-displayRow*current.preference.sizePx)+'px';
  }
  requestAnimationFrame(renderFrame);
}
async function syncSnapshot(){
  if(drag!==null)return;
  try{
    const response=await fetch('/__dsh/pet/overlay-state',{cache:'no-store'});
    if(response.ok)applySnapshot(await response.json());
  }catch{}
}
button.addEventListener('pointerenter',()=>{hover=true;applyPointerInteraction()});
button.addEventListener('pointerleave',()=>{hover=false;applyPointerInteraction()});
button.addEventListener('pointerdown',event=>{
  if(event.button!==0)return;
  event.preventDefault();
  button.setPointerCapture(event.pointerId);
  const pending={pointerId:event.pointerId,startX:event.clientX,startY:event.clientY,sequence:0};
  drag=pending;moved=false;
  if(api)void api.startDrag({pointerId:event.pointerId,screenX:event.screenX,screenY:event.screenY}).then(result=>{if(drag===pending)pending.dragId=result.dragId}).catch(()=>{if(drag===pending)drag=null});
});
button.addEventListener('pointermove',event=>{
  if(drag===null||drag.pointerId!==event.pointerId)return;
  if(Math.hypot(event.clientX-drag.startX,event.clientY-drag.startY)>4)moved=true;
  if(api&&drag.dragId!==undefined){drag.sequence+=1;void api.moveDrag({dragId:drag.dragId,pointerId:drag.pointerId,sequence:drag.sequence,screenX:event.screenX,screenY:event.screenY}).then(result=>{if(result.accepted&&result.direction!=='neutral')animationName=result.direction==='left'?'running-left':'running-right'}).catch(()=>{})}
});
button.addEventListener('pointerup',event=>{
  const pending=drag;if(pending===null||pending.pointerId!==event.pointerId)return;
  drag=null;
  if(api&&pending.dragId!==undefined){pending.sequence+=1;void api.endDrag({dragId:pending.dragId,pointerId:pending.pointerId,sequence:pending.sequence,screenX:event.screenX,screenY:event.screenY}).catch(()=>{})}
});
button.addEventListener('pointercancel',event=>{
  const pending=drag;if(pending===null||pending.pointerId!==event.pointerId)return;
  drag=null;
  if(api&&pending.dragId!==undefined)void api.cancelDrag({dragId:pending.dragId,pointerId:pending.pointerId}).catch(()=>{});
});
button.addEventListener('click',()=>{if(moved){moved=false;return}if(api)void api.focusMain().catch(()=>{})});
button.addEventListener('contextmenu',event=>{
  event.preventDefault();
  if(drag!==null)return;
  openMenu(event.clientX,event.clientY);
});
menuClose.addEventListener('click',()=>{void closePet()});
window.addEventListener('pointerdown',event=>{if(menuOpen&&!menu.contains(event.target))closeMenu()},true);
window.addEventListener('keydown',event=>{if(event.key==='Escape')closeMenu()});
void syncSnapshot();
setInterval(()=>void syncSnapshot(),750);
requestAnimationFrame(renderFrame);
</script>`
}

export default PetService
