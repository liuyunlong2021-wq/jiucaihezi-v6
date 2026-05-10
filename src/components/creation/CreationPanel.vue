<script setup lang="ts">
/**
 * CreationPanel — 创作面板
 * 6 模型精简版: gpt-image-2, grok-video-3, veo3.1-fast,
 *               seedance-2.0, seedance-2.0-fast, suno-5.5
 */
import { computed, ref } from 'vue'
import {
  RH_TASK_LABELS,
  RH_CREATION_MODELS,
  type CreationTask,
} from '@/data/creationModels'
import {
  cpState,
  currentModel,
  availableModels,
  aspectOptions,
  sizeOptions,
  resolutionOptions,
  durationRange,
  hasDuration,
  isImageModel,
  isMusicModel,
  promptPlaceholder,
  showTagsInput,
  showTitleInput,
  switchTask,
  switchModel,
  setAspect,
  setSize,
  setResolution,
  setDuration,
  addFiles,
  removeFile,
  saveCpState,
} from '@/composables/useCreation'
import { runCreation } from '@/composables/useCreationEngine'

// 任务/模型 popover
const openPop = ref<string>('')
function togglePop(key: string) {
  openPop.value = openPop.value === key ? '' : key
}

function onFileSelect(e: Event) {
  const input = e.target as HTMLInputElement
  if (input.files) { addFiles(input.files); input.value = '' }
}

function onFileDrop(e: DragEvent) {
  e.preventDefault()
  if (e.dataTransfer?.files) addFiles(e.dataTransfer.files)
}

const fileThumbs = computed(() =>
  cpState.files.map((f, i) => ({
    index: i,
    name: f.name,
    url: f.type.startsWith('image/') ? URL.createObjectURL(f) : '',
    isVideo: f.type.startsWith('video/'),
    isAudio: f.type.startsWith('audio/'),
  }))
)

const tasks = computed(() =>
  Object.entries(RH_TASK_LABELS).map(([key, label]) => ({ key: key as CreationTask, label }))
)

const modelList = computed(() =>
  availableModels.value.map(k => ({ key: k, label: RH_CREATION_MODELS[k]?.label || k }))
)
</script>

<template>
  <div class="cp">
    <div class="cp-toolbar">
      <span class="cp-title"><span class="mso">movie_filter</span>创作面板</span>
    </div>

    <!-- 画廊区 -->
    <div class="cp-gallery">
      <div v-if="cpState.results.length" class="cp-results">
        <div v-for="(r, i) in cpState.results.slice(0, 12)" :key="i" class="cp-result-item">
          <img v-if="r.type === 'image'" :src="r.url" alt="" class="cp-result-img" />
          <video v-else-if="r.type === 'video'" :src="r.url" controls class="cp-result-vid" />
          <audio v-else-if="r.type === 'audio'" :src="r.url" controls class="cp-result-aud" />
          <a v-else :href="r.url" target="_blank" class="cp-result-link">{{ r.url }}</a>
        </div>
      </div>
      <div v-else class="cp-empty">
        <span class="mso" style="font-size: 32px;">auto_awesome</span>
        <div>在下方写下提示词<br/>AI 将在这里呈现你的作品</div>
      </div>
    </div>

    <!-- 参数条 -->
    <div class="cp-params">
      <!-- 任务 -->
      <div class="cp-island" @click="togglePop('task')">
        <div class="cp-island-label">任务</div>
        <div class="cp-island-val">{{ RH_TASK_LABELS[cpState.task] }}</div>
        <div v-if="openPop === 'task'" class="cp-popover" @click.stop>
          <button v-for="t in tasks" :key="t.key" class="cp-pop-item"
                  :class="{ active: cpState.task === t.key }"
                  @click="switchTask(t.key); openPop = ''">
            {{ t.label }}
          </button>
        </div>
      </div>
      <!-- 模型 -->
      <div class="cp-island" @click="togglePop('model')">
        <div class="cp-island-label">模型</div>
        <div class="cp-island-val">{{ currentModel?.label || cpState.modelKey }}</div>
        <div v-if="openPop === 'model'" class="cp-popover" @click.stop>
          <button v-for="m in modelList" :key="m.key" class="cp-pop-item"
                  :class="{ active: cpState.modelKey === m.key }"
                  @click="switchModel(m.key); openPop = ''">
            {{ m.label }}
          </button>
        </div>
      </div>
      <!-- 尺寸 (gpt-image-2) -->
      <div v-if="sizeOptions.length" class="cp-island" @click="togglePop('size')">
        <div class="cp-island-label">尺寸</div>
        <div class="cp-island-val">{{ cpState.size }}</div>
        <div v-if="openPop === 'size'" class="cp-popover" @click.stop>
          <button v-for="s in sizeOptions" :key="s" class="cp-pop-item"
                  :class="{ active: cpState.size === s }"
                  @click="setSize(s); openPop = ''">
            {{ s }}
          </button>
        </div>
      </div>
      <!-- 比例 (视频) -->
      <div v-if="aspectOptions.length" class="cp-island" @click="togglePop('ar')">
        <div class="cp-island-label">比例</div>
        <div class="cp-island-val">{{ cpState.ar }}</div>
        <div v-if="openPop === 'ar'" class="cp-popover" @click.stop>
          <button v-for="a in aspectOptions" :key="a" class="cp-pop-item"
                  :class="{ active: cpState.ar === a }"
                  @click="setAspect(a); openPop = ''">
            {{ a }}
          </button>
        </div>
      </div>
      <!-- 分辨率 (grok) -->
      <div v-if="resolutionOptions.length" class="cp-island">
        <div class="cp-island-label">分辨率</div>
        <div class="cp-btn-group">
          <button v-for="r in resolutionOptions" :key="r" class="cp-param-btn"
                  :class="{ active: cpState.res === r }" @click="setResolution(r)">{{ r }}</button>
        </div>
      </div>
      <!-- 时长 (视频) -->
      <div v-if="hasDuration && durationRange" class="cp-island cp-island-grow">
        <div class="cp-island-label">时长</div>
        <div class="cp-dur-row">
          <input type="range" class="cp-dur-slider" :min="durationRange.min" :max="durationRange.max"
                 :step="durationRange.step" :value="cpState.dur" @input="setDuration(+($event.target as HTMLInputElement).value)" />
          <span class="cp-dur-val">{{ cpState.dur }}s</span>
        </div>
      </div>
    </div>

    <!-- 进度条 -->
    <div v-if="cpState.generating" class="cp-progress">
      <div class="cp-progress-fill" :style="{ width: cpState.progress + '%' }"></div>
    </div>
    <div v-if="cpState.generating" class="cp-progress-text">{{ cpState.progressText }}</div>

    <!-- 提示词输入 -->
    <div class="cp-composer">
      <div v-if="!isMusicModel" class="cp-upload-trigger"
           @click="($refs.fileInput as HTMLInputElement).click()"
           @dragover.prevent @drop="onFileDrop" title="上传参考素材">
        <span class="mso">add</span>
        <input ref="fileInput" type="file" multiple accept="image/*,video/*,audio/*"
               style="display:none" @change="onFileSelect" />
      </div>
      <div class="cp-prompt-wrap">
        <!-- 文件缩略图 -->
        <div v-if="fileThumbs.length" class="cp-files">
          <div v-for="f in fileThumbs" :key="f.index" class="cp-file-thumb">
            <img v-if="f.url" :src="f.url" alt="" />
            <span v-else-if="f.isVideo" class="mso">videocam</span>
            <span v-else-if="f.isAudio" class="mso">audiotrack</span>
            <span v-else class="mso">insert_drive_file</span>
            <button class="cp-file-remove" @click="removeFile(f.index)">×</button>
          </div>
        </div>
        <!-- Suno: 标题 + 风格标签 -->
        <div v-if="showTitleInput" class="cp-suno-row">
          <input v-model="cpState.title" placeholder="歌曲标题" class="cp-suno-input" @blur="saveCpState()" />
        </div>
        <div v-if="showTagsInput" class="cp-suno-row">
          <input v-model="cpState.tags" placeholder="风格标签 (如: pop, rock, edm)" class="cp-suno-input" @blur="saveCpState()" />
        </div>
        <textarea v-model="cpState.prompt" rows="1" :placeholder="promptPlaceholder"
                  @blur="saveCpState()" class="cp-prompt-input" />
      </div>
      <div class="cp-submit">
        <button class="cp-send-btn" @click="runCreation" title="生成"
                :disabled="cpState.generating">
          <span class="mso">arrow_upward</span>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.cp { display: flex; flex-direction: column; height: 100%; background: var(--surface); }
.cp-toolbar {
  display: flex; align-items: center; padding: 12px 16px; border-bottom: 1px solid var(--line);
}
.cp-title { font-size: 14px; font-weight: 700; color: var(--ink1); display: flex; align-items: center; gap: 4px; }
.cp-title .mso { font-size: 16px; color: var(--olive); }

/* Gallery */
.cp-gallery { flex: 1; overflow-y: auto; padding: 16px; min-height: 120px; }
.cp-empty {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 8px; height: 100%; color: var(--ink3); text-align: center; font-size: 13px;
}
.cp-empty .mso { color: var(--olive); }
.cp-results { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 8px; }
.cp-result-img, .cp-result-vid { width: 100%; border-radius: 8px; }
.cp-result-aud { width: 100%; }

/* Params */
.cp-params {
  display: flex; gap: 6px; padding: 8px 12px; border-top: 1px solid var(--line);
  flex-wrap: wrap; align-items: flex-start;
}
.cp-island {
  position: relative; padding: 6px 10px; border-radius: 8px;
  border: 1px solid var(--line); cursor: pointer; transition: border-color .12s;
}
.cp-island:hover { border-color: var(--olive); }
.cp-island-grow { flex: 1; min-width: 120px; }
.cp-island-label { font-size: 10px; color: var(--ink3); margin-bottom: 2px; }
.cp-island-val { font-size: 12px; font-weight: 600; color: var(--ink1); }
.cp-popover {
  position: absolute; bottom: 100%; left: 0; z-index: 20;
  background: var(--paper); border: 1px solid var(--line); border-radius: 10px;
  box-shadow: 0 -4px 16px rgba(0,0,0,.1); padding: 4px; min-width: 140px; max-height: 300px; overflow-y: auto;
  margin-bottom: 4px;
}
.cp-pop-item {
  display: block; width: 100%; padding: 8px 12px; border: none; background: none;
  text-align: left; font-size: 12px; cursor: pointer; border-radius: 6px; color: var(--ink1); font-family: inherit;
}
.cp-pop-item:hover { background: var(--olive-pale); }
.cp-pop-item.active { background: var(--olive-pale); color: var(--olive-dark); font-weight: 700; }

.cp-btn-group { display: flex; gap: 3px; flex-wrap: wrap; }
.cp-param-btn {
  padding: 3px 8px; border: 1px solid var(--line); border-radius: 6px;
  background: none; font-size: 11px; cursor: pointer; color: var(--ink2); font-family: inherit;
}
.cp-param-btn.active { background: var(--olive); color: #fff; border-color: var(--olive); }
.cp-param-btn:hover { border-color: var(--olive); }
.cp-dur-row { display: flex; align-items: center; gap: 6px; }
.cp-dur-slider { flex: 1; accent-color: var(--olive); }
.cp-dur-val { font-size: 12px; font-weight: 700; color: var(--olive-dark); min-width: 28px; }

/* Progress */
.cp-progress { height: 3px; background: var(--line); margin: 0 12px; border-radius: 2px; overflow: hidden; }
.cp-progress-fill { height: 100%; background: var(--olive); transition: width .3s; }
.cp-progress-text { text-align: center; font-size: 11px; color: var(--ink3); padding: 4px 0; }

/* Composer */
.cp-composer {
  display: flex; align-items: flex-end; gap: 8px; padding: 10px 12px;
  border-top: 1px solid var(--line);
}
.cp-upload-trigger {
  width: 36px; height: 36px; display: flex; align-items: center; justify-content: center;
  border-radius: 10px; border: 1.5px dashed var(--line); cursor: pointer; flex-shrink: 0;
}
.cp-upload-trigger:hover { border-color: var(--olive); background: var(--olive-pale); }
.cp-upload-trigger .mso { font-size: 20px; color: var(--ink3); }
.cp-prompt-wrap { flex: 1; min-width: 0; }
.cp-files { display: flex; gap: 4px; flex-wrap: wrap; margin-bottom: 6px; }
.cp-file-thumb {
  position: relative; width: 44px; height: 44px; border-radius: 6px;
  border: 1px solid var(--line); overflow: hidden; display: flex;
  align-items: center; justify-content: center; background: var(--surface-alt);
}
.cp-file-thumb img { width: 100%; height: 100%; object-fit: cover; }
.cp-file-thumb .mso { font-size: 18px; color: var(--ink3); }
.cp-file-remove {
  position: absolute; top: -2px; right: -2px; width: 16px; height: 16px;
  border-radius: 50%; background: var(--olive); color: #fff; border: none;
  font-size: 10px; cursor: pointer; display: flex; align-items: center; justify-content: center;
}
.cp-suno-row { margin-bottom: 6px; }
.cp-suno-input {
  width: 100%; padding: 4px 0; border: none; border-bottom: 1px solid var(--line);
  background: none; font-size: 13px; color: var(--ink); outline: none; font-family: inherit;
}
.cp-prompt-input {
  width: 100%; border: none; background: none; font-size: 13px; color: var(--ink);
  resize: none; outline: none; font-family: inherit; line-height: 1.5;
}
.cp-submit { flex-shrink: 0; }
.cp-send-btn {
  width: 36px; height: 36px; border-radius: 50%; border: none;
  background: var(--olive); color: #fff; cursor: pointer; display: flex;
  align-items: center; justify-content: center; transition: transform .1s;
}
.cp-send-btn:hover { transform: scale(1.08); }
.cp-send-btn:disabled { opacity: .5; cursor: not-allowed; }
.cp-send-btn .mso { font-size: 18px; }
</style>
