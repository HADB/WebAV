export function playOutputStream (
  stream: ReadableStream,
  resourceList: string[],
  attachEl: Element
) {
  const container = document.createElement('div')
  attachEl.appendChild(container)

  const resourceEl = document.createElement('div')
  resourceEl.innerHTML =
    `Load resource:<br/>` +
    resourceList
      .map(str => `<a href="${str}" target="_blank">${str}</>`)
      .join('<br/>')
  container.appendChild(resourceEl)

  const stateEl = document.createElement('div')
  stateEl.textContent = 'loading...'
  container.appendChild(stateEl)

  const videoEl = document.createElement('video')
  videoEl.controls = true
  videoEl.autoplay = true
  videoEl.style.cssText = `
    width: 900px;
    height: 500px;
    display: block;
  `

  const downloadBtn = createDownloadBtn(videoEl.src)
  async function load () {
    let timeStart = performance.now()
    videoEl.src = URL.createObjectURL(await new Response(stream).blob())
    stateEl.textContent = `cost: ${Math.round(performance.now() - timeStart)}ms`
    downloadBtn.style.visibility = 'visible'
  }
  load().catch(console.error)

  const closeEl = document.createElement('button')
  closeEl.textContent = 'close'
  closeEl.style.marginRight = '16px'

  container.appendChild(closeEl)
  container.appendChild(downloadBtn)
  container.appendChild(videoEl)

  const close = () => {
    container.remove()
    URL.revokeObjectURL(videoEl.src)
  }
  closeEl.onclick = close

  return {
    close,
    updateState: (desc: string) => {
      stateEl.textContent = desc
    }
  }
}

function createDownloadBtn (url: string) {
  const downloadEl = document.createElement('button')
  downloadEl.textContent = 'download'
  downloadEl.onclick = () => {
    const aEl = document.createElement('a')
    document.body.appendChild(aEl)
    aEl.setAttribute('href', url)
    aEl.setAttribute('download', `WebAv-export-${Date.now()}.mp4`)
    aEl.setAttribute('target', '_self')
    aEl.click()
  }
  downloadEl.style.visibility = 'visible'
  return downloadEl
}
