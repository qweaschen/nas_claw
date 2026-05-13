/**
 * 番号识别模块 - 从文件名提取AV番号
 */

// 标准番号模式 (e.g., ABC-123, ABCD-12345)
const STANDARD_PATTERN = /([A-Z]{2,10})-?(\d{2,8})/i;

// FC2 模式 (e.g., FC2-PPV-1234567, FC2PPV-1234567)
const FC2_PATTERN = /FC2[-_\s]?PPV[-_\s]?(\d{4,10})/i;

// FC2 无 PPV 模式 (e.g., FC2-1234567, FC2_1234567)
const FC2_SHORT_PATTERN = /FC2[-_\s](\d{4,10})/i;

// 素人/Amateur 模式 (e.g., 200GANA-1234, 259LUXU-123)
const AMATEUR_PATTERN = /(\d{3}[A-Z]{2,6})-?(\d{2,6})/i;

// Caribbean 模式 (e.g., 123456-789)
const CARIB_PATTERN = /(\d{6})-(\d{3})/;

// Heyzo 模式 (e.g., HEYZO-1234)
const HEYZO_PATTERN = /HEYZO[-_\s]?(\d{4})/i;

// 10musume / 1pondo patterns (e.g., 123456_01)
const UNCENSORED_PATTERN = /(\d{6})_(\d{2,3})/;

// 清理文件名中的干扰字符
function cleanFilename(filename) {
  // 去掉文件扩展名
  let name = filename.replace(/\.[^.]+$/, '');
  // 去掉常见标签
  name = name.replace(/\[(.*?)\]/g, ' ');
  name = name.replace(/【(.*?)】/g, ' ');
  name = name.replace(/\((.*?)\)/g, ' ');
  // 去掉分辨率标签
  name = name.replace(/\b(1080p|720p|4K|2160p|480p|HD|FHD|UHD)\b/gi, ' ');
  // 去掉编码标签
  name = name.replace(/\b(x264|x265|h264|h265|HEVC|AVC|AAC|MP4|AVI|MKV|WMV)\b/gi, ' ');
  // 去掉特殊字符间隔
  name = name.replace(/[._]/g, '-');
  return name.trim();
}

/**
 * 从文件名解析番号
 * @param {string} filename 文件名
 * @returns {{ avid: string, type: string } | null}
 */
function parseAvid(filename) {
  const cleaned = cleanFilename(filename);

  // FC2 完整格式 (FC2-PPV-xxx)
  let match = cleaned.match(FC2_PATTERN);
  if (match) {
    return { avid: `FC2-PPV-${match[1]}`, type: 'fc2' };
  }

  // FC2 短格式 (FC2-xxx, 无 PPV)
  match = cleaned.match(FC2_SHORT_PATTERN);
  if (match) {
    return { avid: `FC2-PPV-${match[1]}`, type: 'fc2' };
  }

  // Heyzo
  match = cleaned.match(HEYZO_PATTERN);
  if (match) {
    return { avid: `HEYZO-${match[1]}`, type: 'uncensored' };
  }

  // Caribbean / 1pondo / 10musume (numbers_numbers pattern)
  match = cleaned.match(UNCENSORED_PATTERN);
  if (match) {
    return { avid: `${match[1]}_${match[2]}`, type: 'uncensored' };
  }

  // Caribbean dash pattern
  match = cleaned.match(CARIB_PATTERN);
  if (match) {
    return { avid: `${match[1]}-${match[2]}`, type: 'uncensored' };
  }

  // Amateur / 素人 (number prefix)
  match = cleaned.match(AMATEUR_PATTERN);
  if (match) {
    return { avid: `${match[1]}-${match[2]}`, type: 'amateur' };
  }

  // Standard (ABC-123)
  match = cleaned.match(STANDARD_PATTERN);
  if (match) {
    const prefix = match[1].toUpperCase();
    const num = match[2];
    return { avid: `${prefix}-${num}`, type: 'normal' };
  }

  return null;
}

module.exports = { parseAvid, cleanFilename };
