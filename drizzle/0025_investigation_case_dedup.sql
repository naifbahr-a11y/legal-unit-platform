UPDATE `investigation_cases` SET `caseNumber` = NULL WHERE `caseNumber` IS NOT NULL AND TRIM(`caseNumber`) = '';--> statement-breakpoint
UPDATE `investigation_cases` ic
INNER JOIN (
  SELECT `caseNumber` FROM `investigation_cases`
  WHERE `caseNumber` IS NOT NULL AND TRIM(`caseNumber`) != ''
  GROUP BY `caseNumber` HAVING COUNT(*) > 1
) d ON ic.`caseNumber` = d.`caseNumber`
SET ic.`caseNumber` = CONCAT(ic.`caseNumber`, '-', ic.`id`);
