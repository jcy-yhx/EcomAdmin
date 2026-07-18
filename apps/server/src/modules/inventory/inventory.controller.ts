import { Controller, Post, Body } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { InventoryService } from './inventory.service';
import { StockInDto, DeductDto } from './dto/inventory.dto';

@ApiTags('Inventory')
@Controller('inventory')
@ApiBearerAuth()
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Post('stock-in')
  @ApiOperation({ summary: '入库（增加库存）' })
  stockIn(@Body() dto: StockInDto) {
    return this.inventoryService.stockIn(dto.skuId, dto.quantity, dto.remark);
  }

  @Post('deduct')
  @ApiOperation({ summary: '扣减库存（Redis 分布式锁防超卖）' })
  deduct(@Body() dto: DeductDto) {
    return this.inventoryService.deduct(dto.skuId, dto.quantity);
  }
}
