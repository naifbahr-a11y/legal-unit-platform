-- Normalize empty identifiers and resolve duplicates before unique indexes
UPDATE `cases` SET `caseNumber` = NULL WHERE `caseNumber` IS NOT NULL AND TRIM(`caseNumber`) = '';
--> statement-breakpoint
UPDATE `bank_properties` SET `propertyNumber` = NULL WHERE `propertyNumber` IS NOT NULL AND TRIM(`propertyNumber`) = '';
--> statement-breakpoint
UPDATE `mortgaged_properties` SET `propertyNumber` = NULL WHERE `propertyNumber` IS NOT NULL AND TRIM(`propertyNumber`) = '';
--> statement-breakpoint
UPDATE `cases` c
INNER JOIN (
  SELECT `caseNumber`, MIN(`id`) AS `keep_id`
  FROM `cases`
  WHERE `caseNumber` IS NOT NULL
  GROUP BY `caseNumber`
  HAVING COUNT(*) > 1
) d ON c.`caseNumber` = d.`caseNumber` AND c.`id` != d.`keep_id`
SET c.`caseNumber` = CONCAT(c.`caseNumber`, '-', c.`id`);
--> statement-breakpoint
UPDATE `bank_properties` p
INNER JOIN (
  SELECT `propertyNumber`, MIN(`id`) AS `keep_id`
  FROM `bank_properties`
  WHERE `propertyNumber` IS NOT NULL
  GROUP BY `propertyNumber`
  HAVING COUNT(*) > 1
) d ON p.`propertyNumber` = d.`propertyNumber` AND p.`id` != d.`keep_id`
SET p.`propertyNumber` = CONCAT(p.`propertyNumber`, '-', p.`id`);
--> statement-breakpoint
UPDATE `mortgaged_properties` p
INNER JOIN (
  SELECT `propertyNumber`, MIN(`id`) AS `keep_id`
  FROM `mortgaged_properties`
  WHERE `propertyNumber` IS NOT NULL
  GROUP BY `propertyNumber`
  HAVING COUNT(*) > 1
) d ON p.`propertyNumber` = d.`propertyNumber` AND p.`id` != d.`keep_id`
SET p.`propertyNumber` = CONCAT(p.`propertyNumber`, '-', p.`id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `cases_case_number_uidx` ON `cases` (`caseNumber`);
--> statement-breakpoint
CREATE UNIQUE INDEX `bank_properties_property_number_uidx` ON `bank_properties` (`propertyNumber`);
--> statement-breakpoint
CREATE UNIQUE INDEX `mortgaged_properties_property_number_uidx` ON `mortgaged_properties` (`propertyNumber`);
