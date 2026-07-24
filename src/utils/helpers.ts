/** 播放指定地址的音频，并吞掉不可播放资源导致的异步异常 */
export function playAudio(src: string) {
    /** 当前需要播放的音频实例 */
    const audio = new Audio(src);
    /** 当前音频播放请求，用于捕获浏览器或 Electron 返回的异步失败 */
    const playPromise = audio.play();

    playPromise?.catch((error) => {
        console.warn("[Language Learner] Audio play failed:", src, error);
    });
}
