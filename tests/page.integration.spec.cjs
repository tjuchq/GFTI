/**
 * 文件说明：通过真实页面验证数据、古风气韵评测与 UI 的接线结果。
 */
'use strict';

const { test, expect } = require('@playwright/test');

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

    // 手动点击下一题会清理自动跳转计时器，测试无需等待自动前进。
    await page.locator('.opt[data-key="' + optionKey + '"]').click();
    await page.locator('#btn-next').click();

    if (questionIndex < 19) {
      await expect(counter).not.toHaveText(counterBefore);
    }
  }

  await expect(page.locator('#scene-result')).toHaveClass(/on/);
}

// 期望值来自重构前的真实页面，用来阻止算法提取改变线上结果。
test('固定答案在重构前后得到完全相同的页面结果', async function ({ page }) {
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
    profile: [98, 75, 94, 97, 78],
    matches: [
      { name: '龙书龟契', displayPercent: 93 },
      { name: '风萤月', displayPercent: 63 },
      { name: '东阳夜怪醉话', displayPercent: 57 },
      { name: '松烟入墨', displayPercent: 52 },
      { name: '九九八十一', displayPercent: 41 }
    ]
  });
});
