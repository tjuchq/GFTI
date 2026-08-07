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

// 期望值来自算法 1.0.1 的正式基线，用来阻止后续重构悄悄改变页面结果。
test('固定答案会得到算法 1.0.1 的完整页面结果', async function ({ page }) {
  await completeAssessment(page, 'A');

  const renderedResult = await page.evaluate(function () {
    return {
      profile: Array.from(document.querySelectorAll('.axis .lab .l i')).map(function (element) {
        return Number(element.textContent.replace('%', ''));
      }),
      matches: Array.from(document.querySelectorAll('.song')).map(function (element) {
        return {
          name: element.querySelector('.nm').textContent,
          displayPercent: Number(element.querySelector('.sim b').textContent)
        };
      })
    };
  });

  expect(renderedResult).toEqual({
    profile: [100, 90, 100, 100, 94.8],
    matches: [
      { name: '龙书龟契', displayPercent: 100 },
      { name: '东阳夜怪醉话', displayPercent: 100 },
      { name: '旷古回响', displayPercent: 78 },
      { name: '九九八十一', displayPercent: 60 },
      { name: '永定四十年', displayPercent: 35 }
    ]
  });
});
