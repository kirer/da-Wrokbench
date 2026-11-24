/**
 * 带 `ai-photo-` 前缀的图是 AI 生成的示意图（不是用户真实的店铺、产品）。
 * 转代码、打 zip、导出整套 HTML 时认这个前缀，提醒「上线前换成真实照片」。
 *
 * 以前还有个 find_photos 工具会往设计目录里放这种图，那个工具已经裁掉了；
 * 这里留着是为了认得出用户手上已有的设计里的这类图。
 */
import path from 'node:path'

export const PHOTO_PREFIX = 'ai-photo-'

export const isPhotoAsset = (name) => path.basename(String(name)).startsWith(PHOTO_PREFIX)
