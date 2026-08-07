/**
 * 文件说明：通过真实页面验证数据、古风气韵评测与 UI 的接线结果。
 */
'use strict';

const { test, expect } = require('@playwright/test');

// 完整答题会等待十九次页面过渡，给较慢的 CI Runner 留出稳定余量。
test.setTimeout(60000);

/**
 * 从页面开始一次评测，并为每道题选择指定选项。
 *
 * @param {import('@playwright/test').Page} page 浏览器页面。
 * @param {string} optionKey 每道题选择的选项键。
 * @returns {Promise<void>}
 */
async function completeAssessment(page, optionKey) {
  await page.goto('/index.html');
  await page.locator('#btn-start').click();
  await expect(page.locator('#scene-quiz')).toHaveClass(/on/);

  for (let questionIndex = 0; questionIndex < 20; questionIndex += 1) {
    const counter = page.locator('#counter');
    const counterBefore = await counter.textContent();

    // 前十九题只等待页面自己的自动跳转，避免与同一计时器争抢前进动作。
    await page.locator('.opt[data-key="' + optionKey + '"]').click();
    if (questionIndex < 19) {
      await expect(counter).not.toHaveText(counterBefore);
    } else {
      // 末题按产品规则不自动跳转，由用户明确点击查看结果。
      await page.locator('#btn-next').click();
    }
  }

  await expect(page.locator('#scene-result')).toHaveClass(/on/);
}

// 页面测试只负责 UI 接线；具体算法数值由唯一算法基线独立锁定。
test('页面会完整展示公开评测 interface 返回的结果', async function ({ page }) {
  await completeAssessment(page, 'A');

  const comparison = await page.evaluate(function () {
    const answers = window.GFTI_DATA.questions.map(function () { return 'A'; });
    const assessment = window.GFTIAssessment.createAssessment({
      questions: window.GFTI_DATA.questions,
      songs: window.GFTI_DATA.songs
    });
    const expected = assessment.evaluate(answers, { topN: 5 });

    return {
      rendered: {
        profile: Array.from(document.querySelectorAll('.axis .lab .l i')).map(function (element) {
          return Number(element.textContent.replace('%', ''));
        }),
        matches: Array.from(document.querySelectorAll('.song')).map(function (element) {
          return {
            name: element.querySelector('.nm').textContent,
            displayPercent: Number(element.querySelector('.sim b').textContent)
          };
        })
      },
      expected: {
        profile: expected.profile,
        matches: expected.matches.map(function (match) {
          return { name: match.name, displayPercent: match.displayPercent };
        })
      }
    };
  });

  expect(comparison.rendered).toEqual(comparison.expected);
});

// 页面显示格式是产品输出的一部分：五维固定一位小数，契合度固定整数。
test('页面会按产品格式显示五维气韵和契合度', async function ({ page }) {
  await completeAssessment(page, 'A');

  const formats = await page.evaluate(function () {
    return {
      profile: Array.from(document.querySelectorAll('.axis .lab i')).map(function (element) {
        return element.textContent;
      }),
      matches: Array.from(document.querySelectorAll('.song .sim b')).map(function (element) {
        return element.textContent;
      })
    };
  });

  formats.profile.forEach(function (value) {
    expect(value).toMatch(/^\d+\.\d%$/);
  });
  formats.matches.forEach(function (value) {
    expect(value).toMatch(/^\d+$/);
  });
});
